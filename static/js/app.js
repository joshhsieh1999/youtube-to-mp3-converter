let currentUrl = '';
let currentTaskId = '';
let currentTitle = '';
let pollInterval = null;
let logStartTime = null;
let logCollapsed = false;

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let b = bytes;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(1)} ${units[i]}`;
}

function formatViews(n) {
    if (!n) return '';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B views`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K views`;
    return `${n} views`;
}

function formatUploadDate(d) {
    if (!d || d.length !== 8) return '';
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function formatEta(seconds) {
    if (seconds == null || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}s left`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s left`;
}

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

function setStep(stepId, state) {
    document.getElementById(stepId).setAttribute('data-state', state);
}

function resetSteps() {
    ['step-fetch', 'step-download', 'step-convert', 'step-done'].forEach(id =>
        setStep(id, 'pending')
    );
}

function toggleLog() {
    logCollapsed = !logCollapsed;
    const body = document.getElementById('log-body');
    const toggle = document.getElementById('log-toggle');
    if (logCollapsed) {
        body.classList.add('collapsed');
        toggle.innerHTML = '&#9654;';
    } else {
        body.classList.remove('collapsed');
        toggle.innerHTML = '&#9660;';
    }
}

function addLogEntry(message, level, timestamp) {
    const entries = document.getElementById('log-entries');
    const el = document.createElement('div');
    el.className = `log-entry ${level || 'info'}`;

    let timeStr = '';
    if (timestamp && logStartTime) {
        const elapsed = timestamp - logStartTime;
        const s = Math.floor(elapsed);
        const ms = Math.floor((elapsed % 1) * 10);
        timeStr = `${String(s).padStart(3, '\u2007')}.${ms}s`;
    }

    el.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg">${escapeHtml(message)}</span>`;
    entries.appendChild(el);

    const logBody = document.getElementById('log-body');
    logBody.scrollTop = logBody.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let lastLogCount = 0;

function syncLogs(logs) {
    if (!logs || logs.length === 0) return;

    if (logStartTime === null && logs.length > 0) {
        logStartTime = logs[0].time;
    }

    for (let i = lastLogCount; i < logs.length; i++) {
        const log = logs[i];
        addLogEntry(log.message, log.level, log.time);
    }
    lastLogCount = logs.length;
}

function reset() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = null;
    currentUrl = '';
    currentTaskId = '';
    currentTitle = '';
    lastLogCount = 0;
    logStartTime = null;

    document.getElementById('url-input').value = '';
    document.getElementById('url-input').disabled = false;
    document.getElementById('info-btn').disabled = false;
    document.getElementById('info-btn-text').textContent = 'Get Info';
    document.getElementById('info-btn-spinner').hidden = true;
    document.getElementById('input-error').hidden = true;
    document.getElementById('log-entries').innerHTML = '';

    hide('info-card');
    hide('pipeline-card');
    hide('progress-card');
    hide('done-card');
    hide('error-card');
    hide('log-card');
    resetSteps();

    document.getElementById('url-input').focus();
}

async function fetchInfo() {
    const urlInput = document.getElementById('url-input');
    const errorEl = document.getElementById('input-error');
    const btn = document.getElementById('info-btn');
    const btnText = document.getElementById('info-btn-text');
    const btnSpinner = document.getElementById('info-btn-spinner');
    const url = urlInput.value.trim();

    errorEl.hidden = true;
    hide('error-card');

    if (!url) {
        errorEl.textContent = 'Please enter a YouTube URL.';
        errorEl.hidden = false;
        return;
    }

    btn.disabled = true;
    btnText.textContent = 'Loading';
    btnSpinner.hidden = false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error || 'Something went wrong.';
            errorEl.hidden = false;
            return;
        }

        currentUrl = url;
        currentTitle = data.title || 'audio';

        // Populate video info
        document.getElementById('thumbnail').src = data.thumbnail || '';
        document.getElementById('video-title').textContent = data.title || 'Unknown';
        document.getElementById('video-channel').textContent = data.channel || '';
        document.getElementById('video-duration').textContent = data.duration ? formatDuration(data.duration) : '';
        document.getElementById('video-views').textContent = formatViews(data.view_count);
        document.getElementById('video-date').textContent = formatUploadDate(data.upload_date);

        // Estimated MP3 size (rough: duration * 192kbps / 8)
        const estEl = document.getElementById('est-size');
        if (data.duration) {
            const estBytes = data.duration * 192 * 1000 / 8;
            estEl.textContent = '~' + formatBytes(estBytes);
            estEl.style.display = '';
        } else {
            estEl.style.display = 'none';
        }

        // Hide empty tags
        ['video-duration', 'video-views', 'video-date'].forEach(id => {
            const el = document.getElementById(id);
            el.style.display = el.textContent ? '' : 'none';
        });

        show('info-card');
    } catch (err) {
        if (err.name === 'AbortError') {
            errorEl.textContent = 'Request timed out. Please try again.';
        } else {
            errorEl.textContent = 'Network error. Please check your connection and try again.';
        }
        errorEl.hidden = false;
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Get Info';
        btnSpinner.hidden = true;
    }
}

async function startConversion() {
    const btn = document.getElementById('convert-btn');
    btn.disabled = true;
    btn.textContent = 'Starting...';

    document.getElementById('url-input').disabled = true;
    document.getElementById('info-btn').disabled = true;

    // Show pipeline, progress, and log
    show('pipeline-card');
    show('progress-card');
    show('log-card');
    hide('error-card');
    hide('done-card');
    resetSteps();
    setStep('step-fetch', 'active');
    lastLogCount = 0;
    logStartTime = null;
    document.getElementById('log-entries').innerHTML = '';

    // Reset progress display
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-bar').className = 'progress-bar';
    document.getElementById('progress-percent').textContent = '';
    document.getElementById('progress-status-text').textContent = 'Preparing download...';
    document.getElementById('progress-status-text').style.color = '';
    document.getElementById('progress-downloaded').textContent = '';
    document.getElementById('progress-speed').textContent = '';
    document.getElementById('progress-eta').textContent = '';

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: currentUrl, title: currentTitle }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await res.json();

        if (!res.ok) {
            setStep('step-fetch', 'error');
            showError(data.error || 'Failed to start conversion.');
            return;
        }

        currentTaskId = data.task_id;
        setStep('step-fetch', 'done');
        setStep('step-download', 'active');
        btn.textContent = 'Converting...';

        document.getElementById('progress-status-text').textContent = 'Waiting for download to begin...';

        pollInterval = setInterval(pollProgress, 800);
    } catch (err) {
        if (err.name === 'AbortError') {
            showError('Request timed out. Please try again.');
        } else {
            showError('Network error. Please check your connection.');
        }
    }
}

function retryConversion() {
    hide('error-card');
    document.getElementById('convert-btn').disabled = false;
    document.getElementById('convert-btn').textContent = 'Convert to MP3';
    startConversion();
}

function showError(message) {
    hide('progress-card');
    document.getElementById('error-message').textContent = message;
    show('error-card');

    // Mark current active step as error
    ['step-fetch', 'step-download', 'step-convert', 'step-done'].forEach(id => {
        if (document.getElementById(id).getAttribute('data-state') === 'active') {
            setStep(id, 'error');
        }
    });

    // Re-enable inputs
    document.getElementById('url-input').disabled = false;
    document.getElementById('info-btn').disabled = false;
    document.getElementById('convert-btn').disabled = false;
    document.getElementById('convert-btn').textContent = 'Convert to MP3';
}

let pollErrorCount = 0;

async function pollProgress() {
    try {
        const res = await fetch(`/api/progress/${currentTaskId}`);
        const data = await res.json();
        pollErrorCount = 0;

        syncLogs(data.logs);

        if (data.status === 'starting') {
            setStep('step-fetch', 'done');
            setStep('step-download', 'active');

            document.getElementById('progress-bar').style.width = '5%';
            document.getElementById('progress-bar').className = 'progress-bar starting';
            document.getElementById('progress-percent').textContent = '';
            document.getElementById('progress-status-text').textContent = 'Preparing download...';
            document.getElementById('progress-status-text').style.color = '';
            document.getElementById('progress-speed').textContent = 'Resolving URL...';

        } else if (data.status === 'downloading') {
            setStep('step-fetch', 'done');
            setStep('step-download', 'active');

            const pct = data.percent || 0;
            document.getElementById('progress-bar').style.width = Math.max(pct, 5) + '%';
            document.getElementById('progress-bar').className = 'progress-bar';
            document.getElementById('progress-percent').textContent = pct + '%';
            document.getElementById('progress-status-text').textContent = 'Downloading audio...';
            document.getElementById('progress-status-text').style.color = '';

            const dl = data.downloaded_bytes ? formatBytes(data.downloaded_bytes) : '';
            const total = data.total_bytes ? formatBytes(data.total_bytes) : '';
            document.getElementById('progress-downloaded').textContent =
                dl && total ? `${dl} / ${total}` : dl;
            document.getElementById('progress-speed').textContent =
                data.speed ? `${formatBytes(data.speed)}/s` : '';
            document.getElementById('progress-eta').textContent = formatEta(data.eta);

        } else if (data.status === 'converting') {
            setStep('step-download', 'done');
            setStep('step-convert', 'active');

            document.getElementById('progress-bar').style.width = '100%';
            document.getElementById('progress-bar').className = 'progress-bar converting';
            document.getElementById('progress-percent').textContent = '';
            document.getElementById('progress-status-text').textContent = 'Converting to MP3...';
            document.getElementById('progress-status-text').style.color = '';
            document.getElementById('progress-downloaded').textContent = '';
            document.getElementById('progress-speed').textContent = 'FFmpeg processing';
            document.getElementById('progress-eta').textContent = '';

        } else if (data.status === 'done') {
            clearInterval(pollInterval);
            pollInterval = null;

            setStep('step-convert', 'done');
            setStep('step-done', 'done');

            hide('progress-card');
            show('done-card');

            document.getElementById('done-title').textContent = currentTitle || 'audio';
            document.getElementById('done-size').textContent =
                data.file_size ? `MP3 - ${formatBytes(data.file_size)}` : 'MP3 ready';
            document.getElementById('download-link').href = `/api/download/${currentTaskId}`;

            document.getElementById('convert-btn').textContent = 'Convert to MP3';
            document.getElementById('url-input').disabled = false;
            document.getElementById('info-btn').disabled = false;

        } else if (data.status === 'error') {
            clearInterval(pollInterval);
            pollInterval = null;
            showError(data.message || 'Conversion failed.');
        }
    } catch (err) {
        pollErrorCount++;
        if (pollErrorCount >= 5) {
            clearInterval(pollInterval);
            pollInterval = null;
            showError('Lost connection to server. Please try again.');
        }
    }
}

// Enter key to fetch info
document.getElementById('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchInfo();
});
