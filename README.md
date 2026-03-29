# YouTube to MP3 Converter

A self-hosted web app that converts YouTube videos to MP3 files. Paste a YouTube URL, preview the video info, and download the audio as a 192kbps MP3.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Flask](https://img.shields.io/badge/Flask-latest-green)
![Docker](https://img.shields.io/badge/Docker-ready-blue)

## Features

- Paste any YouTube URL (including `youtu.be`, `music.youtube.com`, mobile links)
- Preview video info (title, channel, duration, views) before converting
- Real-time progress tracking with download speed, ETA, and activity log
- Pipeline visualization (Fetch → Download → Convert → Ready)
- Automatic cleanup of old files (1 hour expiry)
- Dark-themed responsive UI

## Quick Start (Docker)

```bash
git clone https://github.com/joshhsieh1999/youtube-to-mp3-converter.git
cd youtube-to-mp3-converter
docker compose up --build -d
```

Open **http://localhost:5000** in your browser.

To stop:

```bash
docker compose down
```

## Manual Setup (without Docker)

**Prerequisites:** Python 3.10+, [ffmpeg](https://ffmpeg.org/download.html)

```bash
git clone https://github.com/joshhsieh1999/youtube-to-mp3-converter.git
cd youtube-to-mp3-converter
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000**.

## How It Works

1. **User pastes a YouTube URL** and clicks "Get Info"
2. The backend calls [yt-dlp](https://github.com/yt-dlp/yt-dlp) to fetch video metadata (title, thumbnail, duration, etc.)
3. User clicks "Convert to MP3" — the backend spawns a background thread that:
   - Downloads the best available audio stream via yt-dlp
   - Converts it to MP3 (192kbps) using ffmpeg
4. The frontend polls `/api/progress/<task_id>` every 800ms to display real-time progress
5. Once complete, the user downloads the MP3 file

## Project Structure

```
├── app.py              # Flask app — API endpoints, task management
├── converter.py        # yt-dlp wrapper — fetch info, download, convert
├── config.py           # Configuration constants (paths, limits, URL patterns)
├── cleanup.py          # Background thread — deletes files older than 1 hour
├── requirements.txt    # Python dependencies (flask, yt-dlp)
├── Dockerfile          # Python 3.12-slim + ffmpeg
├── docker-compose.yml  # Single-service setup with volume mounts
├── templates/
│   └── index.html      # Single-page frontend
├── static/
│   ├── css/style.css   # Dark theme, responsive layout
│   └── js/app.js       # Frontend logic — fetch, poll, download
└── downloads/          # Temporary MP3 storage (auto-cleaned)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serve the web UI |
| `POST` | `/api/info` | Fetch video metadata. Body: `{"url": "..."}` |
| `POST` | `/api/convert` | Start conversion. Body: `{"url": "...", "title": "..."}`. Returns `{"task_id": "..."}` |
| `GET` | `/api/progress/<task_id>` | Poll conversion status (percent, speed, ETA, logs) |
| `GET` | `/api/download/<task_id>` | Download the converted MP3 file |

## Configuration

Edit `config.py` to change defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_VIDEO_DURATION` | 7200 (2 hours) | Maximum allowed video length in seconds |
| `MAX_FILE_AGE_SECONDS` | 3600 (1 hour) | Auto-delete MP3 files after this duration |

## License

For personal use only.
