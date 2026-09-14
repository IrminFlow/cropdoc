"""Tests for crop_uploader.py. Run from the repository root:

    python -m unittest discover -s device-client -v
"""
import contextlib
import io
import json
import os
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests
from PIL import Image, ImageFilter

import crop_uploader as cli

TOKEN = 'cd_' + 'A' * 43
INSPECTION_ID = '5f0c9a1e-2b3d-4c5e-8f60-718293a4b5c6'
REPORT_URL = f'https://example.com/reports/{INSPECTION_ID}'
STATUS_URL = f'https://example.com/api/device/inspections/{INSPECTION_ID}'
NOT_JSON = object()
NO_HINTS = {'crop': '', 'location': '', 'notes': ''}


def answer(status, body=None, headers=None):
    """A fake requests.Response."""
    response = Mock(status_code=status, headers=headers or {})
    if body is NOT_JSON:
        response.json.side_effect = ValueError('not JSON')
    else:
        response.json.return_value = {} if body is None else body
    return response


def upload_answer(status, **extra):
    return answer(202, {'inspection_id': INSPECTION_ID, 'status': status, 'report_url': REPORT_URL, **extra})


def save_photo(folder, name='leaf.jpg', size=(20, 20)):
    path = Path(folder) / name
    Image.new('RGB', size, 'green').save(path)
    return path


def send(session, folder, *options, state=None):
    """Upload one photo with send_group, as main() would, using --retries 0 unless overridden."""
    args = cli.build_parser().parse_args(['--retries', '0', '--state', str(Path(folder) / 'state.json'), *options])
    cli.send_group(session, 'https://example.com', 'device', [save_photo(folder)], args,
                   {} if state is None else state)


def env_without_cropdoc(**extra):
    env = {key: value for key, value in os.environ.items() if not key.startswith('CROPDOC_')}
    return patch.dict(os.environ, {**env, **extra}, clear=True)


def configured_env():
    return env_without_cropdoc(CROPDOC_APP_URL='https://example.com', CROPDOC_DEVICE_TOKEN=TOKEN)


def run_main(argv):
    """Run the command line; return (exit code, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cli.main(argv)
    return code, out.getvalue(), err.getvalue()


def files_args(folder):
    return ['--config', str(Path(folder) / 'none.json'), '--state', str(Path(folder) / 'state.json')]


class PhotoTests(unittest.TestCase):
    def test_resizes_and_strips_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'crop.png'
            Image.new('RGB', (2000, 1000), 'green').save(path)
            data = cli.optimize_image(path)
            image = Image.open(io.BytesIO(data))
            self.assertEqual(image.size, (1600, 800))
            self.assertEqual(image.format, 'JPEG')
            self.assertNotIn('exif', image.info)
            self.assertLessEqual(len(data), 750_000)

    def test_accepts_multi_picture_jpeg(self):
        # Android "Ultra HDR" photos are JPEGs with a second image attached (MPO).
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ultra-hdr.jpg'
            Image.new('RGB', (800, 600), 'green').save(
                path, format='MPO', save_all=True, append_images=[Image.new('RGB', (400, 300), 'gray')])
            with Image.open(path) as original:
                self.assertEqual(original.format, 'MPO')
            image = Image.open(io.BytesIO(cli.optimize_image(path)))
            self.assertEqual((image.format, image.size), ('JPEG', (800, 600)))

    def test_damaged_png_is_reported_instead_of_crashing(self):
        noise = Image.frombytes('RGB', (600, 600), random.Random(1).randbytes(600 * 600 * 3))
        buffer = io.BytesIO()
        noise.save(buffer, 'PNG')
        data = bytearray(buffer.getvalue())
        position, idat_chunks = 8, []
        while position < len(data):
            length = struct.unpack('>I', data[position:position + 4])[0]
            if data[position + 4:position + 8] == b'IDAT':
                idat_chunks.append(position)
            position += 12 + length
        self.assertGreater(len(idat_chunks), 1)
        data[idat_chunks[1] + 4:idat_chunks[1] + 8] = b'\x00\x01\x02\x03'  # Pillow raises SyntaxError here
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'broken.png'
            path.write_bytes(data)
            with self.assertRaisesRegex(cli.UploadError, 'broken.png: could not read this photo'):
                cli.optimize_image(path)

    def test_detailed_photo_still_fits_after_server_reencode(self):
        # The server re-encodes at quality 80 and rejects results over 800 KB. A
        # photo that needed a low quality to fit 750 KB used to fail there.
        noise = Image.frombytes('L', (1600, 1600), random.Random(2).randbytes(1600 * 1600))
        photo = Image.merge('RGB', [noise, noise.rotate(90), noise.rotate(180)]).filter(ImageFilter.GaussianBlur(0.4))
        old_output = next(data for data in (cli._encode_jpeg(photo, quality) for quality in cli.JPEG_QUALITIES)
                          if len(data) <= cli.MAX_UPLOAD_IMAGE_BYTES)
        self.assertFalse(cli._fits_after_server_reencode(old_output), 'test photo no longer exercises the bug')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'detailed.png'
            photo.save(path)
            data = cli.optimize_image(path)
        self.assertLessEqual(len(data), cli.MAX_UPLOAD_IMAGE_BYTES)
        self.assertTrue(cli._fits_after_server_reencode(data))
        self.assertLessEqual(max(Image.open(io.BytesIO(data)).size), 1600)

    def test_folder_skips_hidden_files(self):
        # macOS writes "._name.jpg" metadata files onto USB sticks and SD cards.
        with tempfile.TemporaryDirectory() as folder:
            photo = save_photo(folder)
            (Path(folder) / '._leaf.jpg').write_bytes(b'\x00\x05\x16\x07 not a photo')
            (Path(folder) / 'notes.txt').write_text('ignored')
            self.assertEqual(cli.find_photos(Path(folder)), [photo])

    def test_camera_photo_is_owner_only_from_the_start(self):
        fake_cv2 = Mock()
        fake_cv2.VideoCapture.return_value.isOpened.return_value = True
        fake_cv2.VideoCapture.return_value.read.return_value = (True, 'frame')
        fake_cv2.imencode.return_value = (True, Mock(tobytes=Mock(return_value=b'jpeg bytes')))
        modes_when_written = []
        real_fdopen = os.fdopen

        def checking_fdopen(fd, *args, **kwargs):
            modes_when_written.append(os.fstat(fd).st_mode & 0o777)
            return real_fdopen(fd, *args, **kwargs)

        with tempfile.TemporaryDirectory() as folder, patch.dict(sys.modules, {'cv2': fake_cv2}), \
                patch.object(cli.os, 'fdopen', side_effect=checking_fdopen):
            path = cli.capture_photo(0, Path(folder) / 'captures')
            self.assertEqual(modes_when_written, [0o600])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.read_bytes(), b'jpeg bytes')
        fake_cv2.VideoCapture.return_value.release.assert_called_once()


class SettingsTests(unittest.TestCase):
    def test_private_files_are_owner_only_and_flushed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cropdoc' / 'config.json'
            with patch.object(cli.os, 'fsync', wraps=os.fsync) as fsync:
                cli.save_private_json(path, {'app_url': 'https://example.com'})
            fsync.assert_called_once()
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o077, 0)
            self.assertEqual(cli.load_json(path, '')['app_url'], 'https://example.com')
            self.assertEqual(os.listdir(path.parent), ['config.json'])

    def test_failed_write_keeps_previous_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'uploads.json'
            cli.save_private_json(path, {'old': 1})
            with patch.object(cli.json, 'dump', side_effect=OSError('disk full')):
                with self.assertRaises(OSError):
                    cli.save_private_json(path, {'new': 2})
            self.assertEqual(cli.load_json(path, ''), {'old': 1})
            self.assertEqual(os.listdir(folder), ['uploads.json'])

    def test_rejects_insecure_urls(self):
        for value in ['http://example.com', 'https://token@example.com', 'https://example.com?token=x']:
            with self.assertRaises(cli.UploadError):
                cli.check_app_url(value)
        self.assertEqual(cli.check_app_url('http://localhost:3000/'), 'http://localhost:3000')

    def test_configure_replaces_a_damaged_config(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'config.json'
            config.write_text('{not json')
            with patch('builtins.input', return_value='https://example.com'), \
                    patch.object(cli.getpass, 'getpass', return_value=f' {TOKEN} '):
                code, out, _ = run_main(['--configure', '--config', str(config)])
            self.assertEqual(code, 0)
            self.assertIn('Configuration saved', out)
            self.assertEqual(json.loads(config.read_text()), {'app_url': 'https://example.com', 'device_token': TOKEN})

    def test_damaged_config_is_ignored_when_the_environment_has_everything(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'config.json'
            config.write_text('{damaged')
            with env_without_cropdoc(CROPDOC_DEVICE_TOKEN=TOKEN):
                self.assertEqual(cli.load_settings('https://example.com', config), ('https://example.com', TOKEN))
                with self.assertRaisesRegex(cli.UploadError, 'Cannot read'):
                    cli.load_settings(None, config)  # the URL has to come from the file

    def test_missing_setup_says_to_configure(self):
        with tempfile.TemporaryDirectory() as folder, env_without_cropdoc():
            code, _, err = run_main([str(save_photo(folder)), '--config', str(Path(folder) / 'none.json')])
        self.assertEqual(code, 1)
        self.assertIn('--configure', err)

    def test_malformed_token_is_never_printed(self):
        secret = 'cd_' + 'S' * 20 + '\n' + 'S' * 22
        with tempfile.TemporaryDirectory() as folder, \
                env_without_cropdoc(CROPDOC_APP_URL='https://example.com', CROPDOC_DEVICE_TOKEN=secret):
            code, _, err = run_main([str(save_photo(folder)), '--config', str(Path(folder) / 'none.json')])
        self.assertEqual(code, 1)
        self.assertIn('CROPDOC_DEVICE_TOKEN is not valid', err)
        self.assertNotIn('SSSS', err)

    def test_hint_limits_match_the_server(self):
        # The server trims the text and counts UTF-16 units (JavaScript string length).
        cli.check_hints({'crop': '  ' + 'a' * 80 + '  ', 'location': 'पुणे', 'notes': 'n' * 500})
        with self.assertRaisesRegex(cli.UploadError, '--notes is too long .*count as two'):
            cli.check_hints({**NO_HINTS, 'notes': 'n' * 499 + '🌱'})
        with self.assertRaisesRegex(cli.UploadError, '--crop is too long'):
            cli.check_hints({**NO_HINTS, 'crop': 'a' * 81})


class ApiTests(unittest.TestCase):
    def test_quota_errors_are_not_retried(self):
        for code in ('BUDGET_EXHAUSTED', 'DAILY_QUOTA', 'AI_QUOTA', 'AI_CONFIGURATION'):
            with self.subTest(code=code):
                session = Mock()
                session.request.return_value = answer(503 if code == 'AI_CONFIGURATION' else 429,
                    {'error': {'code': code, 'message': 'Try later'}})
                with patch.object(cli.time, 'sleep') as sleep:
                    with self.assertRaisesRegex(cli.UploadError, 'Try later'):
                        cli.api_request(session, 'POST', 'https://example.com')
                sleep.assert_not_called()
                self.assertEqual(session.request.call_count, 1)

    def test_busy_server_is_retried_after_retry_after(self):
        session = Mock()
        busy = {'error': {'code': 'BUSY', 'message': 'Two uploads are already in progress.'}}
        session.request.side_effect = [answer(429, busy, {'Retry-After': '10'}), answer(200, {'ok': True})]
        err = io.StringIO()
        with patch.object(cli.time, 'sleep') as sleep, contextlib.redirect_stderr(err):
            self.assertEqual(cli.api_request(session, 'GET', 'https://example.com'), {'ok': True})
        sleep.assert_called_once_with(10.0)
        self.assertIn('Two uploads are already in progress. Trying again in 10s', err.getvalue())

    def test_certificate_errors_stop_at_once(self):
        session = Mock()
        session.request.side_effect = requests.exceptions.SSLError('certificate verify failed')
        with patch.object(cli.time, 'sleep') as sleep, \
                self.assertRaisesRegex(cli.UploadError, "secure connection.*date and time"):
            cli.api_request(session, 'GET', 'https://example.com', retries=3)
        self.assertEqual(session.request.call_count, 1)
        sleep.assert_not_called()

    def test_redirect_is_not_followed_and_is_explained(self):
        session = Mock()
        session.request.return_value = answer(308, NOT_JSON, {'Location': 'https://new.example.com/api/device/upload'})
        with self.assertRaisesRegex(cli.UploadError, 'redirects to https://new.example.com/.*never follows'):
            cli.api_request(session, 'POST', 'https://example.com/api/device/upload')
        self.assertEqual(session.request.call_count, 1)

    def test_odd_answers_give_clear_errors(self):
        session = Mock()
        session.request.return_value = answer(502, ['not', 'an', 'object'])
        with self.assertRaisesRegex(cli.UploadError, r'server had a problem \(HTTP 502\)'):
            cli.api_request(session, 'GET', 'https://example.com', retries=0)
        # A captive portal or a wrong app URL can answer 200 with a web page.
        session.request.return_value = answer(200, NOT_JSON)
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(cli.UploadError, 'unexpected answer'):
            send(session, folder)

    def test_other_request_errors_are_reported_as_connection_failures(self):
        # requests.RequestException subclasses OSError, so it needs its own handler before OSError's.
        with tempfile.TemporaryDirectory() as folder, configured_env():
            with patch.object(requests.Session, 'request',
                              side_effect=requests.exceptions.ContentDecodingError('bad gzip data')):
                code, _, err = run_main([str(save_photo(folder)), *files_args(folder)])
        self.assertEqual(code, 1)
        self.assertEqual(err.strip(), 'Error: the connection to the server failed (bad gzip data).')

    def test_file_errors_name_the_file(self):
        with tempfile.TemporaryDirectory() as folder, configured_env():
            state = Path(folder) / 'state.json'
            denied = PermissionError(13, 'Permission denied', str(state))
            with patch.object(cli, 'save_private_json', side_effect=denied):
                code, _, err = run_main([str(save_photo(folder)), *files_args(folder)])
        self.assertEqual(code, 1)
        self.assertIn('Permission denied', err)
        self.assertIn(str(state), err)

    def test_netrc_cannot_replace_the_device_token(self):
        with tempfile.TemporaryDirectory() as folder:
            netrc = Path(folder) / 'netrc'
            netrc.write_text('default login someone password other-secret\n')
            netrc.chmod(0o600)
            with patch.dict(os.environ, {'NETRC': str(netrc)}), requests.Session() as session:
                session.auth = cli.BearerToken(TOKEN)
                prepared = session.prepare_request(requests.Request('GET', 'https://example.com/api/device/x'))
        self.assertEqual(prepared.headers['Authorization'], f'Bearer {TOKEN}')
        self.assertNotIn(TOKEN, repr(session.auth))


class UploadFlowTests(unittest.TestCase):
    def test_rerun_after_interruption_sends_the_same_idempotency_key(self):
        # Run 1 retries once and then loses the network; run 2 is a fresh process
        # that only has the saved state file. All three requests must share one key.
        complete = answer(201, {'inspection_id': INSPECTION_ID, 'status': 'complete', 'report': {},
                                'report_url': REPORT_URL})
        request = Mock(side_effect=[answer(503, headers={'Retry-After': '0'}), requests.ConnectionError('offline'),
                                    complete])
        with tempfile.TemporaryDirectory() as folder, configured_env(), \
                patch.object(requests.Session, 'request', request), patch.object(cli.time, 'sleep'):
            argv = [str(save_photo(folder)), '--retries', '1', *files_args(folder)]
            first_code, _, first_err = run_main(argv)
            saved_key = next(iter(cli.load_json(Path(folder) / 'state.json', '').values()))['key']
            second_code, second_out, _ = run_main(argv)
        self.assertEqual(first_code, 1)
        self.assertIn('Network error', first_err)
        self.assertEqual((second_code, second_out.strip()), (0, f'Report: {REPORT_URL}'))
        keys = [call.kwargs['headers']['Idempotency-Key'] for call in request.call_args_list]
        self.assertEqual(keys, [saved_key] * 3)
        self.assertRegex(saved_key, r'^[A-Za-z0-9_-]{16,100}$')
        self.assertTrue(all(call.kwargs['allow_redirects'] is False for call in request.call_args_list))

    def test_completed_state_skips_reupload(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Mock()
            session.request.return_value = answer(201, {'inspection_id': INSPECTION_ID, 'status': 'complete',
                                                        'report': {'summary': 'ok'}, 'report_url': REPORT_URL})
            state, out = {}, io.StringIO()
            with contextlib.redirect_stdout(out):
                send(session, folder, state=state)
                send(session, folder, state=state)
            self.assertEqual(session.request.call_count, 1)
            self.assertEqual(out.getvalue().splitlines(), [f'Report: {REPORT_URL}', f'Already saved: {REPORT_URL}'])
            saved = next(iter(cli.load_json(Path(folder) / 'state.json', '').values()))
            self.assertEqual(saved['status'], 'complete')

    def test_json_report_is_fetched_when_the_upload_answer_lacks_it(self):
        # Re-sending a finished submission returns its status with report: null.
        report = {'summary': 'Leaf spot'}
        with tempfile.TemporaryDirectory() as folder:
            session = Mock()
            session.request.side_effect = [upload_answer('complete', report=None),
                                           answer(200, {'status': 'complete', 'report': report}),
                                           answer(200, {'status': 'complete', 'report': report})]
            state, out = {}, io.StringIO()
            with contextlib.redirect_stdout(out):
                send(session, folder, '--json', state=state)
                send(session, folder, '--json', state=state)
        self.assertEqual(out.getvalue().splitlines(), [f'Report: {REPORT_URL}', json.dumps(report),
                                                       f'Already saved: {REPORT_URL}', json.dumps(report)])
        self.assertEqual(session.request.call_args_list[1].args[:2], ('GET', STATUS_URL))

    def test_retry_failed_requests_exactly_one_more_analysis(self):
        report = {'summary': 'Leaf spot'}
        cases = [({'status': 'failed', 'retryable': True}, 'Requesting another analysis'),
                 ({'status': 'ready', 'retryable': False}, 'Starting the analysis')]
        for status, wording in cases:
            with self.subTest(status['status']), tempfile.TemporaryDirectory() as folder:
                session = Mock()
                session.request.side_effect = [upload_answer('analyzing'), answer(200, status),
                                               answer(200, {'status': 'complete', 'report': report})]
                out, err = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    send(session, folder, '--retry-failed', '--json')
                self.assertEqual(err.getvalue().strip(), f"{wording} (uses one of today's attempts)…")
                self.assertEqual(session.request.call_args_list[2].args[:2], ('POST', STATUS_URL))
                self.assertEqual(out.getvalue().splitlines(), [f'Report: {REPORT_URL}', json.dumps(report)])
        # The paid request itself is never retried, even when --retries allows it.
        with tempfile.TemporaryDirectory() as folder:
            session = Mock()
            session.request.side_effect = [upload_answer('failed'),
                                           answer(200, {'status': 'failed', 'retryable': True}), answer(503)]
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(cli.UploadError):
                send(session, folder, '--retry-failed', '--retries', '3')
            self.assertEqual(session.request.call_count, 3)

    def test_unstarted_analysis_does_not_suggest_a_paid_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Mock()
            session.request.side_effect = [upload_answer('uploading'),
                                           answer(200, {'status': 'ready', 'retryable': False})]
            with self.assertRaises(cli.UploadError) as caught:
                send(session, folder)
        self.assertIn('Run the same command again to start it', str(caught.exception))
        self.assertNotIn('--retry-failed', str(caught.exception))

    def test_failed_analysis_shows_the_reason(self):
        with tempfile.TemporaryDirectory() as folder:
            session = Mock()
            session.request.side_effect = [
                upload_answer('failed'),
                answer(200, {'status': 'failed', 'retryable': True,
                             'error_message': 'The AI service is temporarily unavailable. Try again later.'}),
            ]
            state = {}
            with self.assertRaisesRegex(cli.UploadError, 'temporarily unavailable.*--retry-failed'):
                send(session, folder, state=state)
            self.assertEqual(next(iter(state.values()))['status'], 'failed')

    def test_missing_or_unknown_status_stops_without_waiting(self):
        for status_answer, expected in [(answer(200, NOT_JSON), 'unexpected answer'),
                                        (answer(200, {'status': 'deleting'}), '"deleting"')]:
            with self.subTest(expected), tempfile.TemporaryDirectory() as folder:
                session = Mock()
                session.request.side_effect = [upload_answer('analyzing'), status_answer]
                with patch.object(cli.time, 'sleep') as sleep, self.assertRaisesRegex(cli.UploadError, expected):
                    send(session, folder)
                sleep.assert_not_called()

    def test_camera_failure_points_to_the_saved_photo(self):
        with tempfile.TemporaryDirectory() as folder, configured_env():
            photo = save_photo(folder, 'capture-1.jpg')
            with patch.object(cli, 'capture_photo', return_value=photo), \
                    patch.object(requests.Session, 'request', side_effect=requests.ConnectionError('offline')):
                code, _, err = run_main(['--camera', '--retries', '0', *files_args(folder)])
        self.assertEqual(code, 1)
        self.assertIn('Network error', err)
        self.assertIn(f'The camera photo is saved at {photo}', err)
        self.assertIn('instead of --camera', err)


if __name__ == '__main__':
    unittest.main()
