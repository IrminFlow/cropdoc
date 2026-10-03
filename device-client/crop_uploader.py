#!/usr/bin/env python3
"""Upload crop photos to CropDoc and print a link to each report.

Runs on a Raspberry Pi or any computer, optionally with a USB camera. The only
secret stored on this device is the CropDoc device token; AI provider keys
never belong here.
"""
from __future__ import annotations

import argparse
import contextlib
import getpass
import hashlib
import io
import json
import os
import random
import re
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps
from requests.auth import AuthBase

CONFIG_DIR = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'cropdoc'
STATE_DIR = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local' / 'state')) / 'cropdoc'

# Server contract: see the "API" section of the root README and src/lib/*.ts.
TOKEN_PATTERN = re.compile(r'cd_[A-Za-z0-9_-]{43}')
MAX_PHOTOS_PER_GROUP = 4
HINT_LIMITS = {'crop': 80, 'location': 120, 'notes': 500}
SERVER_JPEG_QUALITY = 80  # the server re-encodes every photo at this quality...
SERVER_MAX_IMAGE_BYTES = 800_000  # ...and rejects the result if it is larger than this
# Codes that come with HTTP 429 but will not clear up by retrying.
STOP_CODES = frozenset({'AI_CONFIGURATION', 'AI_QUOTA', 'DAILY_QUOTA', 'BUDGET_EXHAUSTED', 'STORAGE_QUOTA', 'TOKEN_REVOKED', 'ACCOUNT_DELETED'})

# Photo preparation, matching the web app's in-browser optimizer.
SUPPORTED_SUFFIXES = frozenset({'.jpg', '.jpeg', '.png', '.webp'})
MAX_SOURCE_BYTES = 20_000_000
MAX_SOURCE_PIXELS = 40_000_000
LONGEST_EDGES = (1600, 1400, 1200, 1000, 800)  # below 1600 only for extremely detailed photos
JPEG_QUALITIES = (85, 70, 55, 40)
MAX_UPLOAD_IMAGE_BYTES = 750_000

TIMEOUT = (15, 110)  # seconds to connect, seconds to wait for an answer
ANALYSIS_WAIT_SECONDS = 130
POLL_SECONDS = 3
CAMERA_WARMUP_FRAMES = 5  # the first frames are often dark while exposure settles

CONFIG_FIX = 'Run --configure to set up this device again.'
STATE_FIX = ('The upload history file is damaged. Rename it and run again; '
             'uploads that had not finished may be sent again.')
UNEXPECTED_ANSWER = ('The server sent an unexpected answer. Check that the app URL points to CropDoc '
                     '(run --configure to change it).')


class UploadError(Exception):
    """A problem to report to the user. The message is shown as-is."""


# --- Private files -----------------------------------------------------------

def save_private_json(path: Path, value: dict[str, Any]) -> None:
    """Atomically write ``value`` as JSON that only the current user can read.

    The data goes to a new owner-only temporary file, is flushed to disk, and
    then replaces ``path``, so a crash or power cut leaves the old or the new file.
    """
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=f'.{path.name}.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump(value, out, indent=2)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temp)
        raise


def load_json(path: Path, fix: str) -> dict[str, Any]:
    """Read a JSON object from ``path``. A missing file counts as empty."""
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(value, dict):
            raise ValueError('not a JSON object')
    except (OSError, ValueError) as error:
        raise UploadError(f'Cannot read {path}. {fix}') from error
    return value


# --- Settings and options ----------------------------------------------------

def check_app_url(value: str) -> str:
    """Return the app's base URL without a trailing slash, or explain what is wrong."""
    value = value.strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise UploadError('Use the app base URL without credentials, query, or fragment.')
    if not parsed.hostname or parsed.path not in ('', '/'):
        raise UploadError('Use the app base URL, for example https://cropdoc-lilac.vercel.app.')
    is_local = parsed.hostname in ('localhost', '127.0.0.1', '::1')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and is_local):
        raise UploadError('Use HTTPS. HTTP is allowed only for local development.')
    return value


def check_token(token: str, described_as: str) -> str:
    """Return the token without surrounding spaces if it has the server's format."""
    token = token.strip()
    if not TOKEN_PATTERN.fullmatch(token):
        # Never echo the value: it may be a real secret with a typo in it.
        raise UploadError(f'{described_as} is not valid. Device tokens start with "cd_" and are '
                          '46 characters long. Copy it again from the CropDoc web app.')
    return token


def load_settings(app_url: str | None, config_path: Path) -> tuple[str, str]:
    """Return ``(base_url, device_token)`` from the options and environment, else the config file.

    The file is read only for a value the environment does not supply, so a
    damaged file cannot stop a device that is set up with environment variables.
    """
    token = os.environ.get('CROPDOC_DEVICE_TOKEN')
    token_source = 'CROPDOC_DEVICE_TOKEN'
    if not app_url or not token:
        config = load_json(config_path, CONFIG_FIX)
        app_url = app_url or config.get('app_url')
        if not token:
            token, token_source = config.get('device_token'), str(config_path)
    if not app_url or not token:
        raise UploadError('This device is not set up yet. Run the uploader with --configure, '
                          'or set CROPDOC_APP_URL and CROPDOC_DEVICE_TOKEN.')
    if not isinstance(app_url, str) or not isinstance(token, str):
        raise UploadError(f'Cannot read {config_path}. {CONFIG_FIX}')
    return check_app_url(app_url), check_token(token, f'The device token in {token_source}')


def check_hints(hints: dict[str, str]) -> None:
    """Reject crop/location/notes text the server would refuse."""
    for name, limit in HINT_LIMITS.items():
        # The server trims the text and counts UTF-16 units (JavaScript string length).
        length = len(hints[name].strip().encode('utf-16-le', 'surrogatepass')) // 2
        if length > limit:
            message = f'--{name} is too long ({length} characters; the limit is {limit}).'
            if len(hints[name].strip()) <= limit:
                message += ' Emoji and some symbols count as two characters.'
            raise UploadError(message)


# --- Photos ------------------------------------------------------------------

def find_photos(path: Path | None) -> list[Path]:
    """Return ``path`` itself, or the supported photos directly inside a folder, by name."""
    if path is None or not path.exists():
        raise UploadError('Give the path of an existing photo or folder, or use --camera.')
    if not path.is_dir():
        return [path]
    photos = sorted(
        child for child in path.iterdir()
        # Hidden files such as macOS "._IMG_0001.jpg" are metadata, not photos.
        if child.is_file() and not child.name.startswith('.') and child.suffix.lower() in SUPPORTED_SUFFIXES
    )
    if not photos:
        raise UploadError(f'No JPEG, PNG, or WebP photos found in {path}. Photos in subfolders are not included.')
    return photos


def capture_photo(camera_index: int, folder: Path) -> Path:
    """Take one photo with a USB camera and save it, owner-only, in ``folder``."""
    try:
        import cv2  # optional dependency, only needed for --camera
    except ImportError as error:
        raise UploadError('USB camera support is not installed. Run: pip install -r requirements-camera.txt') from error
    camera = cv2.VideoCapture(camera_index)
    try:
        if not camera.isOpened():
            raise UploadError(f'USB camera {camera_index} could not be opened. Check that it is plugged in '
                              'and that this user may use it (the "video" group on Linux).')
        frame = None
        for _ in range(CAMERA_WARMUP_FRAMES):
            ok, latest = camera.read()
            if ok:
                frame = latest
        if frame is None:
            raise UploadError('The camera did not return a photo.')
        ok, encoded = cv2.imencode('.jpg', frame)
        if not ok:
            raise UploadError('The camera photo could not be saved.')
    finally:
        camera.release()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = folder / f'capture-{uuid.uuid4()}.jpg'
    # Created owner-only from the start, never readable by others even briefly.
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as out:
        out.write(encoded.tobytes())
    return path


def optimize_image(path: Path) -> bytes:
    """Return the photo as a small JPEG that the server will accept.

    Like the web app: apply the EXIF rotation, put transparent areas on white,
    fit within 1600 pixels, drop all metadata, and encode under 750 KB.
    """
    if path.stat().st_size > MAX_SOURCE_BYTES:
        raise UploadError(f'{path.name}: choose a photo smaller than 20 MB.')
    image = _open_photo(path)
    for edge in LONGEST_EDGES:
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        for quality in JPEG_QUALITIES:
            data = _encode_jpeg(image, quality)
            if len(data) <= MAX_UPLOAD_IMAGE_BYTES and _fits_after_server_reencode(data):
                return data
    raise UploadError(f'{path.name}: this photo has too much fine detail to upload. Try another photo.')


def _open_photo(path: Path) -> Image.Image:
    """Decode a still JPEG/PNG/WebP into an upright RGB image."""
    try:
        with Image.open(path) as original:
            # Multi-picture JPEGs (Android "Ultra HDR" photos, some cameras) are
            # normal JPEG photos with extra images attached; use the main one.
            is_multi_picture_jpeg = original.format == 'MPO'
            if not is_multi_picture_jpeg and (
                    original.format not in ('JPEG', 'PNG', 'WEBP') or getattr(original, 'n_frames', 1) != 1):
                raise UploadError(f'{path.name}: only still JPEG, PNG, and WebP photos are supported.')
            if original.width * original.height > MAX_SOURCE_PIXELS:
                raise UploadError(f'{path.name}: choose a photo under 40 megapixels.')
            oriented = ImageOps.exif_transpose(original)
            if oriented.mode in ('RGBA', 'LA') or 'transparency' in oriented.info:
                rgba = oriented.convert('RGBA')
                image = Image.new('RGB', rgba.size, 'white')
                image.paste(rgba, mask=rgba.getchannel('A'))
                return image
            return oriented.convert('RGB')
    except Image.DecompressionBombError as error:
        raise UploadError(f'{path.name}: choose a photo under 40 megapixels.') from error
    except (OSError, ValueError, SyntaxError, EOFError) as error:
        # Pillow reports damaged files with any of these (a broken PNG raises SyntaxError).
        raise UploadError(f'{path.name}: could not read this photo. Use a JPEG, PNG, or WebP image.') from error


def _encode_jpeg(image: Image.Image, quality: int) -> bytes:
    out = io.BytesIO()
    image.save(out, format='JPEG', quality=quality, optimize=True)
    return out.getvalue()


def _fits_after_server_reencode(jpeg: bytes) -> bool:
    """True if the server's own re-encode of ``jpeg`` stays within its size limit.

    A photo that needed a low quality to fit 750 KB can grow past 800 KB when
    the server re-encodes it at quality 80. Pillow's encoder makes larger files
    than the server's (mozjpeg) at the same quality, so this check errs on the
    safe side.
    """
    with Image.open(io.BytesIO(jpeg)) as decoded:
        return len(_encode_jpeg(decoded, SERVER_JPEG_QUALITY)) <= SERVER_MAX_IMAGE_BYTES


# --- API ---------------------------------------------------------------------

class BearerToken(AuthBase):
    """Sends the device token on every request.

    Installed as ``session.auth`` so that requests never replaces it with
    credentials from a ~/.netrc file.
    """

    def __init__(self, token: str) -> None:
        self._token = token

    def __call__(self, request: requests.PreparedRequest) -> requests.PreparedRequest:
        request.headers['Authorization'] = f'Bearer {self._token}'
        return request

    def __repr__(self) -> str:
        return '<BearerToken hidden>'


def api_request(session: requests.Session, method: str, url: str, *, retries: int = 3,
                **kwargs: Any) -> dict[str, Any]:
    """Call the CropDoc API and return its JSON object.

    Network failures, server errors (5xx), and "busy" answers (429) are retried
    up to ``retries`` times with backoff, honouring Retry-After. Every other
    error, including daily and provider quota 429s, stops at once. Redirects are
    never followed, so the device token only goes to the configured app URL.
    """
    attempt = 0
    while True:
        retry_after = None
        try:
            response = session.request(method, url, timeout=TIMEOUT, allow_redirects=False, **kwargs)
        except requests.exceptions.SSLError as error:
            # Certificate problems do not go away by retrying.
            raise UploadError('Could not make a secure connection to the server. Check the app URL and that '
                              "this device's date and time are correct.") from error
        except requests.Timeout:
            failure = 'The server did not answer in time.'
        except (requests.ConnectionError, requests.exceptions.ChunkedEncodingError):
            failure = 'Network error. Check the internet connection.'
        else:
            body = _json_object(response)
            if 200 <= response.status_code < 300:
                return body
            code, failure = _describe_error(response, body)
            is_temporary = response.status_code >= 500 or response.status_code == 429
            if not is_temporary or code in STOP_CODES:
                raise UploadError(failure)
            retry_after = response.headers.get('Retry-After')
        if attempt >= retries:
            raise UploadError(f'{failure} Run the same command again later to continue.')
        delay = _retry_delay(attempt, retry_after)
        print(f'{failure} Trying again in {delay:.0f}s…', file=sys.stderr)
        time.sleep(delay)
        attempt += 1


def _json_object(response: requests.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _describe_error(response: requests.Response, body: dict[str, Any]) -> tuple[str | None, str]:
    """Return the API error code (if any) and a message for the user."""
    status = response.status_code
    if 300 <= status < 400:
        target = response.headers.get('Location')
        return None, (f'The app URL redirects{f" to {target}" if target else ""}. Update the app URL '
                      '(run --configure or set CROPDOC_APP_URL). For safety the uploader never follows '
                      'redirects with your device token.')
    error = body.get('error')
    code = error.get('code') if isinstance(error, dict) else None
    message = error.get('message') if isinstance(error, dict) else error
    if not isinstance(message, str) or not message.strip():
        message = (f'The CropDoc server had a problem (HTTP {status}).' if status >= 500
                   else f'{UNEXPECTED_ANSWER} (HTTP {status})')
    return code, message


def _retry_delay(attempt: int, retry_after: str | None) -> float:
    """Seconds to wait: Retry-After (at most 60), else exponential backoff with jitter (at most 20)."""
    if retry_after:
        try:
            return min(60.0, max(0.0, float(retry_after)))
        except ValueError:
            pass  # an HTTP date; fall back to backoff
    return min(20.0, 2 ** attempt + random.random())


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(value)
    except (TypeError, ValueError, AttributeError):
        return False
    return True


# --- Uploading ---------------------------------------------------------------

def send_group(session: requests.Session, base_url: str, token_hash: str, paths: list[Path],
               args: argparse.Namespace, state: dict[str, Any]) -> None:
    """Upload one group of photos (one report), print the report link, and save progress to ``args.state``.

    The group's idempotency key is saved before the first request, so rerunning
    the same command after any interruption resumes that submission instead of
    creating, and paying for, a new one.
    """
    images = [optimize_image(path) for path in paths]
    hints = hints_from(args)
    fingerprint = _submission_fingerprint(base_url, token_hash, hints, images)
    entry: dict[str, Any] | None = state.get(fingerprint)
    if not isinstance(entry, dict) or not isinstance(entry.get('key'), str):
        entry = state[fingerprint] = {'key': str(uuid.uuid4()), 'status': 'pending'}
    if entry.get('status') == 'complete':
        print(f"Already saved: {entry.get('report_url')}")
        if args.json and _is_uuid(entry.get('inspection_id')):
            result = api_request(session, 'GET', _status_url(base_url, entry['inspection_id']), retries=args.retries)
            print(json.dumps(result.get('report'), ensure_ascii=False))
        return
    entry['files'] = [str(path.resolve()) for path in paths]
    save_private_json(args.state, state)
    try:
        files = [('images', (f'photo-{index}.jpg', image, 'image/jpeg')) for index, image in enumerate(images)]
        result = api_request(session, 'POST', f'{base_url}/api/device/upload', retries=args.retries,
                             headers={'Idempotency-Key': entry['key']}, files=files, data=hints)
        if not (_is_uuid(result.get('inspection_id')) and isinstance(result.get('status'), str)
                and isinstance(result.get('report_url'), str)):
            raise UploadError(UNEXPECTED_ANSWER)
        entry.update(inspection_id=result['inspection_id'], status=result['status'], report_url=result['report_url'])
        save_private_json(args.state, state)
        result = wait_for_report(session, _status_url(base_url, result['inspection_id']), result, args)
    except UploadError:
        entry['status'] = 'failed'
        save_private_json(args.state, state)
        raise
    entry['status'] = 'complete'
    save_private_json(args.state, state)
    print(f"Report: {entry['report_url']}")
    if args.json:
        print(json.dumps(result.get('report'), ensure_ascii=False))


def _submission_fingerprint(base_url: str, token_hash: str, hints: dict[str, str], images: list[bytes]) -> str:
    """Identify a submission by app URL, device, crop/location/notes, and optimized photos."""
    digest = hashlib.sha256(json.dumps([base_url, token_hash, hints], sort_keys=True).encode())
    for image in images:
        digest.update(hashlib.sha256(image).digest())
    return digest.hexdigest()


def _status_url(base_url: str, inspection_id: str) -> str:
    # Built from the configured URL, never from a URL the server sends back.
    return f'{base_url}/api/device/inspections/{inspection_id}'


def wait_for_report(session: requests.Session, status_url: str, result: dict[str, Any],
                    args: argparse.Namespace) -> dict[str, Any]:
    """Poll until the analysis is complete; explain what to do if it cannot finish now."""
    deadline = time.monotonic() + ANALYSIS_WAIT_SECONDS
    retried = False
    while result.get('status') != 'complete':
        result = api_request(session, 'GET', status_url, retries=args.retries)
        status = result.get('status')
        if status == 'complete':
            break
        if status == 'ready' or result.get('retryable'):
            if args.retry_failed and not retried:
                retried = True
                action = 'Starting the analysis' if status == 'ready' else 'Requesting another analysis'
                print(f"{action} (uses one of today's attempts)…", file=sys.stderr)
                # Never retried automatically: each attempt consumes the daily quota.
                result = api_request(session, 'POST', status_url, retries=0)
                continue
            if status == 'ready':
                raise UploadError('Your photos are saved but the analysis has not started. '
                                  'Run the same command again to start it.')
            reason = result.get('error_message')
            if not isinstance(reason, str) or not reason.strip():
                reason = 'The analysis did not finish.'
            raise UploadError(f'{reason.strip()} Your photos are saved. To request another analysis, run the same '
                              "command with --retry-failed (uses one of today's attempts).")
        if status == 'uploading':
            raise UploadError('The photos are still uploading from an earlier attempt. '
                              'Run the same command again in two minutes to continue.')
        if status != 'analyzing':
            raise UploadError(UNEXPECTED_ANSWER if not isinstance(status, str) else
                              f'The report is "{status}" in CropDoc, so there is nothing to wait for. '
                              'Check it in the web app.')
        if time.monotonic() >= deadline:
            raise UploadError('The analysis is taking longer than usual. '
                              'Run the same command again in a few minutes to get the report.')
        time.sleep(POLL_SECONDS)
    if args.json and result.get('report') is None:
        # A repeated upload of a finished submission returns its status but not the report.
        result = api_request(session, 'GET', status_url, retries=args.retries)
    return result


# --- Command line ------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', type=Path, help='photo, or folder of photos (subfolders are skipped)')
    parser.add_argument('--configure', action='store_true', help='save the app URL and device token privately')
    parser.add_argument('--app-url', default=os.environ.get('CROPDOC_APP_URL'),
                        help='app base URL (default: CROPDOC_APP_URL or the saved configuration)')
    parser.add_argument('--config', type=Path, default=CONFIG_DIR / 'config.json',
                        help='configuration file (default: %(default)s)')
    parser.add_argument('--state', type=Path, default=STATE_DIR / 'uploads.json',
                        help='upload history used to resume and skip finished uploads (default: %(default)s)')
    parser.add_argument('--group', action='store_true', help='combine up to four photos of one plant into one report')
    parser.add_argument('--camera', nargs='?', const=0, type=int, metavar='INDEX',
                        help='take the photo with a USB camera (default camera 0)')
    parser.add_argument('--retry-failed', action='store_true',
                        help="request one more analysis after a failed attempt (uses one of today's attempts)")
    parser.add_argument('--retries', type=int, default=3,
                        help='retries after network or server errors, 0 to 5 (default: %(default)s)')
    parser.add_argument('--crop', default='', help='crop name, up to 80 characters')
    parser.add_argument('--location', default='', help='location, up to 120 characters')
    parser.add_argument('--notes', default='', help='what you have noticed, up to 500 characters')
    parser.add_argument('--json', action='store_true', help='also print the report as JSON')
    return parser


def configure(config_path: Path) -> None:
    """Ask for the app URL and device token and save them privately."""
    print('OpenAI checks your photos. Upload crop-only photos without people or personal details.')
    try:
        base_url = check_app_url(input('App URL: '))
        token = check_token(getpass.getpass('Device token (hidden): '), 'That device token')
    except EOFError as error:
        raise UploadError('--configure needs someone to type the answers. On a device without a keyboard, '
                          'set CROPDOC_APP_URL and CROPDOC_DEVICE_TOKEN instead.') from error
    save_private_json(config_path, {'app_url': base_url, 'device_token': token})
    print(f'Configuration saved to {config_path}')


def check_options(args: argparse.Namespace) -> None:
    if not 0 <= args.retries <= 5:
        raise UploadError('--retries must be between 0 and 5.')
    check_hints(hints_from(args))
    if args.camera is not None and args.path:
        raise UploadError('Choose either a photo/folder or --camera, not both.')


def hints_from(args: argparse.Namespace) -> dict[str, str]:
    return {'crop': args.crop, 'location': args.location, 'notes': args.notes}


def _report_failure(message: str, camera_photo: Path | None) -> None:
    if camera_photo:
        message += (f'\nThe camera photo is saved at {camera_photo}. To continue with this photo, run the same '
                    'command with that file instead of --camera (--camera takes a new photo).')
    print(message, file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    camera_photo: Path | None = None
    try:
        if args.configure:
            configure(args.config)
            return 0
        base_url, token = load_settings(args.app_url, args.config)
        check_options(args)
        if args.camera is not None:
            camera_photo = capture_photo(args.camera, STATE_DIR)
        paths = find_photos(camera_photo or args.path)
        if args.group and len(paths) > MAX_PHOTOS_PER_GROUP:
            raise UploadError('A group can contain at most four photos of the same plant.')
        groups = [paths] if args.group else [[path] for path in paths]
        state = load_json(args.state, STATE_FIX)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        with requests.Session() as session:
            session.auth = BearerToken(token)
            for group in groups:
                send_group(session, base_url, token_hash, group, args, state)
        return 0
    except requests.RequestException as error:  # must come before OSError, which it subclasses
        _report_failure(f'Error: the connection to the server failed ({error}).', camera_photo)
    except (UploadError, OSError) as error:
        _report_failure(f'Error: {error}', camera_photo)
    except KeyboardInterrupt:
        _report_failure('Interrupted. Run the same command again to continue.', camera_photo)
        return 130
    return 1


if __name__ == '__main__':
    sys.exit(main())
