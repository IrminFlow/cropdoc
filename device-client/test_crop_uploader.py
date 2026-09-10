import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from PIL import Image
import crop_uploader as cli

class UploaderTests(unittest.TestCase):
    def test_metadata_and_resize(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'crop.png'
            Image.new('RGB', (2000, 1000), 'green').save(path)
            data = cli.optimize(path)
            image = Image.open(io.BytesIO(data))
            self.assertEqual(image.size, (1600, 800))
            self.assertEqual(image.format, 'JPEG')
            self.assertNotIn('exif', image.info)
            self.assertLess(len(data), 750001)

    def test_private_config_and_state(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'config.json'
            cli.save_private(path, {'app_url': 'https://example.com'})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(cli.read_json(path)['app_url'], 'https://example.com')

    def test_prevent_token_redirects_and_insecure_urls(self):
        for value in ['http://example.com', 'https://token@example.com', 'https://example.com?token=x']:
            with self.assertRaises(cli.UploadError):
                cli.valid_url(value)
        self.assertEqual(cli.valid_url('http://localhost:3000'), 'http://localhost:3000')

    def test_quota_errors_are_not_retried(self):
        session = Mock()
        session.request.return_value = Mock(status_code=429, headers={}, json=lambda: {'error': {'code':'BUDGET_EXHAUSTED','message':'Budget reached'}})
        with patch.object(cli.time, 'sleep') as sleep:
            with self.assertRaises(cli.UploadError):
                cli.request(session, 'POST', 'https://example.com')
            sleep.assert_not_called()
            self.assertEqual(session.request.call_count, 1)

    def test_transient_retry_reuses_idempotency_key(self):
        session=Mock()
        session.request.side_effect=[Mock(status_code=503,headers={'Retry-After':'0'},json=lambda:{}),Mock(status_code=200,json=lambda:{'status':'complete'})]
        with patch.object(cli.time, 'sleep'):
            cli.request(session,'POST','https://example.com',headers={'Idempotency-Key':'stable'})
        for call in session.request.call_args_list:
            self.assertEqual(call.kwargs['headers']['Idempotency-Key'],'stable')
            self.assertFalse(call.kwargs['allow_redirects'])

    def test_completed_state_skips_reupload(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'leaf.jpg'; Image.new('RGB',(20,20),'green').save(path)
            args=Mock(crop='',location='',notes='',retries=0,retry_failed=False,json=False)
            session=Mock();session.request.return_value=Mock(status_code=201,json=lambda:{'inspection_id':'id','status':'complete','report_url':'https://example.com/reports/id'})
            state={};state_path=Path(d)/'state.json'
            cli.run_group(session,'https://example.com',[path],args,state,state_path,'fingerprint')
            cli.run_group(session,'https://example.com',[path],args,state,state_path,'fingerprint')
            self.assertEqual(session.request.call_count,1)

if __name__ == '__main__':
    unittest.main()
