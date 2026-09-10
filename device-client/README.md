# CropDoc Python uploader

Requires Python 3.10+ and an internet connection. On Raspberry Pi, use a current 64-bit Raspberry Pi OS with Python 3.11+.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python crop_uploader.py --configure
python crop_uploader.py image.jpg
```

In the CropDoc web app, open **Devices**, name your Pi/computer, and create a token. Enter the app's HTTPS URL and token at the hidden configuration prompt. Configuration is saved with owner-only permissions in `~/.config/cropdoc/config.json`. Alternatively, set `CROPDOC_APP_URL` and `CROPDOC_DEVICE_TOKEN` in your process environment. Do not pass tokens on the command line, commit them, or use provider credentials.

```sh
# One report per file; directory scanning is non-recursive.
python crop_uploader.py ./photos

# Up to four views of ONE plant, combined into one report.
python crop_uploader.py ./one-plant --group --crop Tomato --location Pune

# Include optional observations and print report JSON.
python crop_uploader.py leaf.jpg --notes 'Yellow spots for three days' --json

# Explicitly request another analysis after a failed/stale attempt.
python crop_uploader.py leaf.jpg --retry-failed
```

Files are optimized before transmission. Supported: JPEG, PNG, WebP; still images under 20 MB / 40 megapixels. Output is a JPEG under 750 KB with a longest edge of 1600 pixels and no EXIF. The CLI prints a private report URL; sign into its owning account in the browser to view it.

## USB camera

```sh
pip install -r requirements-camera.txt
python crop_uploader.py --camera
python crop_uploader.py --camera 1 --crop Tomato
```

Camera support uses OpenCV/V4L2, releases the camera after one capture, and stores captures in the private state directory. It does not implement scheduled capture or the Pi CSI camera stack. Check `/dev/video*`, the OS camera permissions, and your device's `video` group if capture fails. On platforms without an OpenCV wheel, install the OS OpenCV package and create a venv with `--system-site-packages`.

## Retry and privacy

Transport errors and transient server responses get up to three retries with exponential backoff. `--retries 0..5` adjusts this. Invalid tokens, invalid files, and exhausted quotas stop immediately. Redirects are never followed with credentials.

State persists in `~/.local/state/cropdoc/uploads.json`, with owner-only permissions. Re-running the same command reuses its idempotency key, checks pending work, and skips completed uploads. After an ambiguous network failure, rerun the same command; do not remove its state file. `--retry-failed` permits one explicit additional AI analysis and consumes another daily attempt. App URL, device identity, image content, and context determine a submission's identity.

The client is intended for one process per state file. For independent concurrent clients, use different `--state` paths. Revoking a token in the web app immediately prevents new device requests. Existing signed image URLs can remain usable for up to five minutes.

Exit codes: `0` successful, `1` failed (details on stderr), `2` invalid command syntax, `130` interrupted. A batch stops on the first failure, preserving state; rerun it to resume. Shared limits are five analyses per account per India-calendar day and the application's $1 total demo budget.

Run tests from the repository root:

```sh
python -m unittest discover -s device-client -v
```
