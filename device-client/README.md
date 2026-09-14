# CropDoc uploader

Sends crop photos from a Raspberry Pi, a USB camera, or a computer to CropDoc, then prints a private link to each report.

## Set up

You need Python 3.10 or newer. On a Raspberry Pi, use a current 64-bit Raspberry Pi OS. Run these commands in this folder:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python crop_uploader.py --configure
```

1. In the CropDoc web app, open **Help → Field cameras**. Name this device and choose **Make key**. The token is shown only once.
2. `--configure` asks for the app URL (for example `https://cropdoc-lilac.vercel.app`) and then the token. The token stays hidden while you type it. Both are saved in `~/.config/cropdoc/config.json`, or `$XDG_CONFIG_HOME/cropdoc/config.json` if that variable is set. Only your user can read the file.

On a device without a keyboard, set `CROPDOC_APP_URL` and `CROPDOC_DEVICE_TOKEN` instead. These take priority over the saved file. Don't type the token on the command line or put it in Git. AI provider keys never belong on the device.

## Send photos

```sh
python crop_uploader.py leaf.jpg                 # one photo, one report
python crop_uploader.py ./photos                 # one report per photo in the folder
python crop_uploader.py ./one-plant --group --crop Tomato --location Pune
python crop_uploader.py leaf.jpg --notes 'Yellow spots for three days' --json
```

What you see:

```text
$ python crop_uploader.py leaf.jpg --crop Tomato
Report: https://cropdoc-lilac.vercel.app/reports/5f0c9a1e-2b3d-4c5e-8f60-718293a4b5c6
```

Open the link while signed in to the CropDoc account that created the token.

- **Running the same command again:** it prints `Already saved: <link>` instead of uploading again.
- **`--json`:** the report is also printed as one line of JSON after the link.
- **Problems:** they are printed as `Error: …` together with what to do next.
- **Retries:** a retry shows a line like `Network error. Check the internet connection. Trying again in 2s…`.

| Option | What it does |
| --- | --- |
| `PATH` | A photo, or a folder of photos. Subfolders and hidden files are skipped. |
| `--group` | Combine up to four photos of the **same plant** into one report |
| `--crop`, `--location`, `--notes` | Optional details, up to 80, 120 and 500 characters (emoji count as two) |
| `--json` | Also print the report as JSON |
| `--camera [INDEX]` | Take the photo with a USB camera (default camera 0) |
| `--retry-failed` | Ask for one more analysis after a failed one. This uses one of today's attempts. |
| `--retries N` | Retries after network or server errors, 0–5 (default 3) |
| `--app-url URL` | Use this app URL instead of the saved one |
| `--config FILE`, `--state FILE` | Use a different settings file or upload-history file |
| `--configure` | Save the app URL and device token |

Supported photos are JPEG (including Android "Ultra HDR" photos), PNG and WebP. Each must be a still image under 20 MB and 40 megapixels. Before sending, each photo is:

- turned upright;
- fitted within 1600 pixels (extremely detailed photos are made a little smaller so that the server accepts them);
- saved as a JPEG under 750 KB, without EXIF data such as GPS location.

## USB camera

```sh
pip install -r requirements-camera.txt
python crop_uploader.py --camera
python crop_uploader.py --camera 1 --crop Tomato
```

The uploader takes one photo with OpenCV (V4L2 on Linux), releases the camera, and keeps the photo in `~/.local/state/cropdoc/`. Running `--camera` again always takes a new photo. If an upload fails, the error message shows where the photo was saved. To resume that upload, run the same command with that file path in place of `--camera`.

Scheduled capture and the Pi ribbon-cable (CSI) camera are not supported. If capture fails, check:

- that the camera shows up under `/dev/video*`;
- the operating system's camera permissions;
- that your user is in the `video` group.

If your platform has no OpenCV wheel, install the operating system's OpenCV package and create the venv with `--system-site-packages`.

## Retries, resuming, and privacy

Google checks your photos and may use them to improve its AI. Upload crop-only photos without people or personal details.

- **Retries:** network errors, server errors, and "server busy" answers are retried up to three times, with growing waits. Change the count with `--retries`. The uploader stops at once for:
  - invalid tokens;
  - secure-connection (certificate) problems, which often mean the device's date and time are wrong;
  - unreadable photos;
  - a used-up daily limit or Google free-tier quota (`AI_QUOTA`).
- **Redirects:** the uploader never follows a redirect, so the token cannot be sent anywhere else. If the app URL redirects, update the app URL.
- **Upload history:** kept in `~/.local/state/cropdoc/uploads.json` (or under `$XDG_STATE_HOME/cropdoc/`). Only your user can read it. It stores a request key for every submission. After any failure, rerun the same command: it continues where it stopped, skips finished photos, and avoids duplicate checks. Don't delete this file while uploads are unfinished.
- **What counts as a new submission:** a submission is identified by the app URL, the token, the photos, and `--crop`/`--location`/`--notes`. Changing any of these makes it a new submission.
- **`--retry-failed`:** asks for one more AI analysis after a failed or interrupted one, and uses one of the account's daily attempts.
- **Don't run two uploads at once** with the same history file, for example from overlapping scheduled (cron) jobs. To run uploaders side by side, give each its own `--state` file.
- **Revoking a token:** revoking the token in the web app blocks this device immediately. Photo links inside a report expire after five minutes.

These limits are shared with the web app: five analyses per account per India-calendar day, and the Google project’s free-tier quota. No paid fallback is used.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Failure (message on stderr) |
| `2` | Wrong command options |
| `130` | Interrupted |

A folder upload stops at the first failure; run it again to continue.

## Tests

From the repository root:

```sh
python -m unittest discover -s device-client -v
```
