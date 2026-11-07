# Project Starlight

A private family gallery for her paintings, with the things she said (voice notes, videos) linked to each one.
Runs on your PC; anyone on your Wi-Fi opens it in a phone browser and can add it to the home screen.

This is a for-fun personal/family project, built to scratch a specific itch rather than as a polished product.
Shared as-is in case it's useful or interesting to someone else — issues and PRs are welcome, but don't expect
enterprise-grade support.

## Run it

Requirements: **Python 3.10+** and **Node.js 18+** (needed once, to build the frontend).

```
pip install -r backend/requirements.txt
```

Then, from this folder:

- **Windows:** double-click `start.bat`
- **WSL / Mac / Linux:** `./start.sh`

Either script builds the frontend on first run (`frontend/dist` isn't checked into the repo) and then starts the
server. Open <http://localhost:8504>. For live-reload while editing the UI, run `cd frontend && npm install && npm run dev`
instead (port 5173).

## On her phone / your iPhone (same Wi-Fi)

1. Find the PC's address: run `ipconfig` and look for the IPv4 address, e.g. `192.168.1.23`.
2. Allow port 8504 through Windows Firewall when it asks (private networks only).
3. On the iPhone open `http://192.168.1.23:8504` in Safari, then Share → **Add to Home Screen**.

Note: on a plain `http://` address Safari blocks the in-page microphone and camera, so recording uses the phone's own
recorder through the file picker ("Record her" → Voice note / Film her). That already works. If you later want true
in-page recording, serve over HTTPS (Tailscale does this with one command).

## How it works

- **Add** (+ button or Inbox): pick many photos, videos and voice notes at once. Dates come from the photo's EXIF time,
  falling back to the file's date. Duplicates are skipped by content hash.
- **Inbox**: new paintings wait here. Select some → set a date, add to the gallery, or sort one by one (name, date, tags, favorite).
- **Match a clip**: each clip shows the paintings closest to it in time. Tick one (or several) and link.
- **Painting page**: her words under the painting. Fix the transcript, record her right there, or link a clip.
- **Search** finds paintings by name, tag, *or what she said*.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `STARLIGHT_DATA` | `./data` | Where the database and media live. **Back this folder up** (e.g. copy to OneDrive). |
| `STARLIGHT_WHISPER_MODEL` | `small` | Model size for transcription. |

There's no login — it's meant to run on your home LAN only. Don't expose the port to the public internet without
adding your own auth/reverse-proxy in front of it.

## Optional extras

- **Transcribe her voice on this PC** (English + Vietnamese): `pip install faster-whisper`, then use "Write them for me" on a clip.
  Without it that button just says it isn't installed; you can still type the words.
- **iPhone HEIC photos**: `pip install pillow-heif`. (Safari normally converts to JPEG on upload, so you may never need it.)

## Moving it later

Everything is relative, so the same app works unchanged behind Tailscale/Funnel or on a cloud host. Copy the `data`
folder across and point `STARLIGHT_DATA` at it. Metadata is one SQLite file and media paths are relative.

## Tests

`cd backend && python -m pytest`
