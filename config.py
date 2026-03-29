import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

MAX_FILE_AGE_SECONDS = 3600  # 1 hour
MAX_VIDEO_DURATION = 7200    # 2 hours

ALLOWED_URL_PATTERNS = re.compile(
    r'^https?://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/|music\.youtube\.com/watch\?v=)'
)

SECRET_KEY = os.urandom(24)
