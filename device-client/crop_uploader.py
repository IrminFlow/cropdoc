#!/usr/bin/env python3
"""CropDoc uploader. Provider keys never belong on this device."""
from __future__ import annotations
import argparse
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import random
import sys
import time
import uuid
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

CONFIG_DIR = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'cropdoc'
STATE_DIR = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local' / 'state')) / 'cropdoc'
SUPPORTED = {'.jpg', '.jpeg', '.png', '.webp'}
TERMINAL = {'DAILY_QUOTA', 'BUDGET_EXHAUSTED', 'STORAGE_QUOTA', 'TOKEN_REVOKED', 'ACCOUNT_DELETED'}

class UploadError(Exception):
    pass


def save_private(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_name(path.name + '.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(value, out, indent=2)
    os.replace(temp, path)
    path.chmod(0o600)


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        result = json.loads(path.read_text())
        if not isinstance(result, dict):
            raise ValueError('not an object')
        return result
    except (ValueError, OSError) as error:
        raise UploadError(f'Cannot read {path}. Move the invalid file aside and retry.') from error


def valid_url(value: str) -> str:
    value = value.strip().rstrip('/')
    parsed = urlparse(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise UploadError('Use the app base URL without credentials, query, or fragment.')
    if not parsed.hostname or parsed.path not in ('', '/'):
        raise UploadError('Use the app base URL, for example https://cropdoc.vercel.app.')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')):
        raise UploadError('Use HTTPS. HTTP is allowed only for local development.')
    return value


def optimize(path: Path) -> bytes:
    if path.stat().st_size > 20_000_000:
        raise UploadError(f'{path.name}: choose an image smaller than 20 MB.')
    try:
        with Image.open(path) as original:
            if original.format not in ('JPEG', 'PNG', 'WEBP') or getattr(original, 'n_frames', 1) != 1:
                raise UploadError(f'{path.name}: only still JPEG, PNG, and WebP are supported.')
            if original.width * original.height > 40_000_000:
                raise UploadError(f'{path.name}: choose an image under 40 megapixels.')
            oriented = ImageOps.exif_transpose(original)
            if oriented.mode in ('RGBA', 'LA') or 'transparency' in oriented.info:
                rgba = oriented.convert('RGBA')
                image = Image.new('RGB', rgba.size, 'white')
                image.paste(rgba, mask=rgba.getchannel('A'))
            else:
                image = oriented.convert('RGB')
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            for quality in (85, 70, 55, 40):
                out = io.BytesIO()
                image.save(out, format='JPEG', quality=quality, optimize=True)
                if out.tell() <= 750_000:
                    return out.getvalue()
            raise UploadError(f'{path.name}: photo is too detailed; use a closer crop.')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise UploadError(f'{path.name}: could not decode this image.') from error


def request(session: requests.Session, method: str, url: str, retries: int = 3, **kwargs) -> dict:
    for attempt in range(retries + 1):
        retry_after = None
        try:
            response = session.request(method, url, timeout=(15, 110), allow_redirects=False, **kwargs)
            try:
                result = response.json()
            except ValueError:
                result = {}
            if 200 <= response.status_code < 300:
                return result
            error = result.get('error', {})
            message = error.get('message', f'Server returned HTTP {response.status_code}.') if isinstance(error, dict) else str(error)
            code = error.get('code') if isinstance(error, dict) else None
            if code in TERMINAL or response.status_code < 500 and response.status_code != 429:
                raise UploadError(message)
            retry_after = response.headers.get('Retry-After')
            failure = message
        except (requests.Timeout, requests.ConnectionError):
            failure = 'Network error. Check your connection and run again to resume.'
        if attempt == retries:
            raise UploadError(failure)
        try:
            delay = min(60, max(0, float(retry_after))) if retry_after else min(20, 2 ** attempt + random.random())
        except ValueError:
            delay = min(20, 2 ** attempt + random.random())
        print(f'Retrying in {delay:.1f}s…', file=sys.stderr)
        time.sleep(delay)
    raise UploadError('Upload failed.')


def capture_camera(index: int) -> Path:
    try:
        import cv2
    except ImportError as error:
        raise UploadError('Install requirements-camera.txt to use a USB camera.') from error
    camera = cv2.VideoCapture(index)
    try:
        if not camera.isOpened():
            raise UploadError(f'USB camera {index} could not be opened. Check permissions and connection.')
        for _ in range(5):
            ok, frame = camera.read()
        if not ok:
            raise UploadError('Camera did not return an image.')
        STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = STATE_DIR / f'capture-{uuid.uuid4()}.jpg'
        if not cv2.imwrite(str(path), frame):
            raise UploadError('Camera photo could not be saved.')
        path.chmod(0o600)
        return path
    finally:
        camera.release()


def run_group(session, base, paths, args, state, state_path, token_fingerprint):
    images = [optimize(path) for path in paths]
    hints = {'crop': args.crop, 'location': args.location, 'notes': args.notes}
    digest = hashlib.sha256(json.dumps([base, token_fingerprint, hints], sort_keys=True).encode())
    for image in images:
        digest.update(hashlib.sha256(image).digest())
    fingerprint = digest.hexdigest()
    entry = state.setdefault(fingerprint, {'key': str(uuid.uuid4()), 'status': 'pending'})
    if entry.get('status') == 'complete':
        print(f"Already saved: {entry['report_url']}")
        return
    entry['files'] = [str(p.resolve()) for p in paths]
    save_private(state_path, state)
    files = [('images', (f'photo-{index}.jpg', image, 'image/jpeg')) for index, image in enumerate(images)]
    try:
        result = request(session, 'POST', base + '/api/device/upload', retries=args.retries,
                         headers={'Idempotency-Key': entry['key']}, files=files, data=hints)
        inspection_id = result['inspection_id']
        entry.update({'inspection_id': inspection_id, 'status': result['status'], 'report_url': result['report_url']})
        save_private(state_path, state)
        status_url = base + '/api/device/inspections/' + inspection_id
        deadline = time.monotonic() + 130
        retried_analysis = False
        while result.get('status') != 'complete':
            result = request(session, 'GET', status_url, retries=args.retries)
            if result.get('status') == 'complete':
                break
            if result.get('status') == 'ready' or result.get('retryable'):
                if args.retry_failed and not retried_analysis:
                    retried_analysis = True
                    result = request(session, 'POST', status_url, retries=0)
                    continue
                raise UploadError('Photos are saved. Run again with --retry-failed to request another analysis.')
            if result.get('status') == 'uploading':
                raise UploadError('Upload is still pending. Run the same command again after two minutes to resume.')
            if time.monotonic() >= deadline:
                raise UploadError('Analysis is still pending. Run the same command later to check again.')
            time.sleep(3)
        entry['status'] = 'complete'
        save_private(state_path, state)
        print(f"Report: {entry['report_url']}")
        if args.json:
            print(json.dumps(result.get('report'), ensure_ascii=False))
    except (UploadError, KeyError) as error:
        entry['status'] = 'failed'
        save_private(state_path, state)
        raise UploadError(str(error)) from error


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', type=Path, help='Image or directory')
    parser.add_argument('--configure', action='store_true', help='Securely save app URL and device token')
    parser.add_argument('--app-url', default=os.environ.get('CROPDOC_APP_URL'))
    parser.add_argument('--config', type=Path, default=CONFIG_DIR / 'config.json')
    parser.add_argument('--state', type=Path, default=STATE_DIR / 'uploads.json')
    parser.add_argument('--group', action='store_true', help='Combine up to four photos of one plant')
    parser.add_argument('--camera', nargs='?', const=0, type=int, help='Capture from USB camera (default index 0)')
    parser.add_argument('--retry-failed', action='store_true', help='Explicitly retry failed analysis (uses quota)')
    parser.add_argument('--retries', type=int, default=3)
    parser.add_argument('--crop', default='')
    parser.add_argument('--location', default='')
    parser.add_argument('--notes', default='')
    parser.add_argument('--json', action='store_true', help='Print report JSON')
    args = parser.parse_args(argv)
    try:
        config = read_json(args.config)
        if args.configure:
            base = valid_url(input('App URL: '))
            token = getpass.getpass('Device token (hidden): ').strip()
            if not token.startswith('cd_') or len(token) != 46:
                raise UploadError('Enter a CropDoc device token.')
            save_private(args.config, {'app_url': base, 'device_token': token})
            print(f'Configuration saved to {args.config}')
            return 0
        base = valid_url(args.app_url or config.get('app_url', ''))
        token = os.environ.get('CROPDOC_DEVICE_TOKEN') or config.get('device_token')
        if not token:
            raise UploadError('Run --configure or set CROPDOC_APP_URL and CROPDOC_DEVICE_TOKEN.')
        if not 0 <= args.retries <= 5:
            raise UploadError('--retries must be between 0 and 5.')
        if len(args.crop) > 80 or len(args.location) > 120 or len(args.notes) > 500:
            raise UploadError('Keep crop under 80, location under 120, and notes under 500 characters.')
        if args.camera is not None and args.path:
            raise UploadError('Choose either a path or --camera.')
        path = capture_camera(args.camera) if args.camera is not None else args.path
        if path is None or not path.exists():
            raise UploadError('Provide an existing image/directory or use --camera.')
        paths = sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED) if path.is_dir() else [path]
        if not paths:
            raise UploadError('No supported images found. Directory upload is non-recursive.')
        if args.group and len(paths) > 4:
            raise UploadError('A group can contain at most four photos of the same plant.')
        state = read_json(args.state)
        token_fingerprint = hashlib.sha256(token.encode()).hexdigest()
        with requests.Session() as session:
            session.headers['Authorization'] = 'Bearer ' + token
            groups = [paths] if args.group else [[p] for p in paths]
            for group in groups:
                run_group(session, base, group, args, state, args.state, token_fingerprint)
        return 0
    except (UploadError, OSError, requests.RequestException) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Interrupted. Run the same command to resume.', file=sys.stderr)
        return 130

if __name__ == '__main__':
    sys.exit(main())
