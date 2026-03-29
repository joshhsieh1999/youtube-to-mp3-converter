import os
import time
import threading
from config import DOWNLOAD_DIR, MAX_FILE_AGE_SECONDS


def _cleanup_loop(progress_store):
    while True:
        time.sleep(600)  # every 10 minutes
        now = time.time()
        # Clean old files
        for f in os.listdir(DOWNLOAD_DIR):
            filepath = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(filepath):
                try:
                    if now - os.path.getmtime(filepath) > MAX_FILE_AGE_SECONDS:
                        os.remove(filepath)
                except OSError:
                    pass
        # Prune stale progress entries
        stale_keys = [
            k for k, v in progress_store.items()
            if v.get('_created', 0) and now - v['_created'] > MAX_FILE_AGE_SECONDS
        ]
        for k in stale_keys:
            progress_store.pop(k, None)


def start_cleanup_thread(progress_store):
    t = threading.Thread(target=_cleanup_loop, args=(progress_store,), daemon=True)
    t.start()
