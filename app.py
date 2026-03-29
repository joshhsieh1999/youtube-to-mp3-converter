import os
import re
import time
import uuid
import threading

from flask import Flask, request, jsonify, send_file, render_template, make_response

from config import DOWNLOAD_DIR, MAX_VIDEO_DURATION, ALLOWED_URL_PATTERNS, SECRET_KEY
from converter import fetch_video_info, convert_to_mp3, _add_log, _format_bytes
from cleanup import start_cleanup_thread

app = Flask(__name__)
app.secret_key = SECRET_KEY

APP_START_TIME = str(int(time.time()))

PROGRESS_STORE = {}
TASK_ID_PATTERN = re.compile(r'^[a-f0-9]{32}$')


def validate_url(url):
    if not url or not isinstance(url, str):
        return False
    return ALLOWED_URL_PATTERNS.match(url) is not None


@app.after_request
def add_no_cache_headers(response):
    if request.path == '/' or request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.route('/')
def index():
    return render_template('index.html', cache_bust=APP_START_TIME)


@app.route('/api/info', methods=['POST'])
def video_info():
    data = request.get_json(silent=True) or {}
    url = data.get('url', '').strip()

    if not validate_url(url):
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    try:
        info = fetch_video_info(url)
    except Exception as e:
        return jsonify({'error': f'Could not fetch video info: {str(e)}'}), 500

    if info.get('duration') and info['duration'] > MAX_VIDEO_DURATION:
        return jsonify({'error': f'Video is too long (max {MAX_VIDEO_DURATION // 3600} hours)'}), 422

    return jsonify(info)


@app.route('/api/convert', methods=['POST'])
def start_conversion():
    data = request.get_json(silent=True) or {}
    url = data.get('url', '').strip()
    title = data.get('title', '').strip() or 'audio'

    if not validate_url(url):
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    task_id = uuid.uuid4().hex

    PROGRESS_STORE[task_id] = {
        'status': 'starting',
        'percent': 0,
        'message': 'Preparing download...',
        'downloaded_bytes': 0,
        'total_bytes': 0,
        'speed': 0,
        'eta': None,
        'logs': [],
        'title': title,
        '_created': time.time(),
    }

    _add_log(PROGRESS_STORE, task_id, 'Task created')
    _add_log(PROGRESS_STORE, task_id, f'Video: {title}')

    def worker():
        try:
            convert_to_mp3(url, task_id, PROGRESS_STORE)
            filepath = os.path.join(DOWNLOAD_DIR, f'{task_id}.mp3')
            filesize = os.path.getsize(filepath) if os.path.isfile(filepath) else 0
            _add_log(PROGRESS_STORE, task_id,
                     f'MP3 ready ({_format_bytes(filesize)})')
            PROGRESS_STORE[task_id].update({
                'status': 'done',
                'percent': 100,
                'message': 'Conversion complete!',
                'speed': 0,
                'eta': None,
                'file_size': filesize,
            })
        except Exception as e:
            _add_log(PROGRESS_STORE, task_id, f'Error: {str(e)}', level='error')
            PROGRESS_STORE[task_id].update({
                'status': 'error',
                'percent': 0,
                'message': f'Conversion failed: {str(e)}',
            })

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    return jsonify({'task_id': task_id})


@app.route('/api/progress/<task_id>')
def get_progress(task_id):
    if not TASK_ID_PATTERN.match(task_id):
        return jsonify({'error': 'Invalid task ID'}), 400

    progress = PROGRESS_STORE.get(task_id)
    if progress is None:
        return jsonify({'status': 'unknown'}), 404

    return jsonify({
        'status': progress.get('status'),
        'percent': progress.get('percent'),
        'message': progress.get('message'),
        'downloaded_bytes': progress.get('downloaded_bytes', 0),
        'total_bytes': progress.get('total_bytes', 0),
        'speed': progress.get('speed', 0),
        'eta': progress.get('eta'),
        'file_size': progress.get('file_size'),
        'logs': progress.get('logs', []),
    })


@app.route('/api/download/<task_id>')
def download_file(task_id):
    if not TASK_ID_PATTERN.match(task_id):
        return jsonify({'error': 'Invalid task ID'}), 400

    filepath = os.path.join(DOWNLOAD_DIR, f'{task_id}.mp3')

    # Path traversal prevention
    if not os.path.abspath(filepath).startswith(os.path.abspath(DOWNLOAD_DIR)):
        return jsonify({'error': 'Invalid path'}), 400

    if not os.path.isfile(filepath):
        return jsonify({'error': 'File not found. It may have expired.'}), 404

    # Get original title for filename
    progress = PROGRESS_STORE.get(task_id, {})
    title = progress.get('title', 'audio')
    safe_title = re.sub(r'[^\w\s-]', '', title).strip() or 'audio'
    download_name = f'{safe_title}.mp3'

    return send_file(filepath, as_attachment=True, download_name=download_name)


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    start_cleanup_thread(PROGRESS_STORE)
    app.run(host='0.0.0.0', port=5000)
