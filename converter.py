import os
import time
import yt_dlp
from config import DOWNLOAD_DIR


def fetch_video_info(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'noplaylist': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        'title': info.get('title'),
        'thumbnail': info.get('thumbnail'),
        'duration': info.get('duration'),
        'id': info.get('id'),
        'channel': info.get('channel') or info.get('uploader'),
        'view_count': info.get('view_count'),
        'upload_date': info.get('upload_date'),
        'filesize_approx': info.get('filesize_approx') or info.get('filesize'),
    }


def _add_log(progress_store, task_id, message, level='info'):
    entry = progress_store.get(task_id)
    if entry is None:
        return
    if 'logs' not in entry:
        entry['logs'] = []
    entry['logs'].append({
        'time': time.time(),
        'message': message,
        'level': level,
    })


def _format_bytes(b):
    if b is None or b == 0:
        return '0 B'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if abs(b) < 1024:
            return f'{b:.1f} {unit}'
        b /= 1024
    return f'{b:.1f} TB'


def _update_progress(d, task_id, progress_store):
    entry = progress_store.get(task_id)
    if entry is None:
        return

    if d['status'] == 'downloading':
        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
        downloaded = d.get('downloaded_bytes', 0)
        speed = d.get('speed') or 0
        eta = d.get('eta')
        if total > 0:
            percent = int(downloaded / total * 100)
        else:
            percent = 0

        entry.update({
            'status': 'downloading',
            'percent': percent,
            'message': f'Downloading... {percent}%',
            'downloaded_bytes': downloaded,
            'total_bytes': total,
            'speed': speed,
            'eta': eta,
        })
    elif d['status'] == 'finished':
        filename = d.get('filename', '')
        filesize = d.get('total_bytes') or d.get('downloaded_bytes') or 0
        _add_log(progress_store, task_id,
                 f'Download complete ({_format_bytes(filesize)})')
        _add_log(progress_store, task_id,
                 'Starting FFmpeg audio extraction...')
        entry.update({
            'status': 'converting',
            'percent': 90,
            'message': 'Converting to MP3...',
            'speed': 0,
            'eta': None,
        })


def convert_to_mp3(url, task_id, progress_store):
    output_template = os.path.join(DOWNLOAD_DIR, f'{task_id}.%(ext)s')

    _add_log(progress_store, task_id, f'Resolving video URL...')

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'progress_hooks': [
            lambda d: _update_progress(d, task_id, progress_store)
        ],
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
    }

    _add_log(progress_store, task_id, 'Starting audio download (best quality)...')

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    return os.path.join(DOWNLOAD_DIR, f'{task_id}.mp3')
