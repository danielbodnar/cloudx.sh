/**
 * UI Pages for cloudx.sh
 * Server-side rendered HTML pages using Hono JSX
 */

import { html } from 'hono/html';

// Common styles
const styles = `
  :root {
    --bg-primary: #0a0a0a;
    --bg-secondary: #141414;
    --bg-tertiary: #1a1a1a;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --accent: #f97316;
    --accent-hover: #fb923c;
    --success: #22c55e;
    --error: #ef4444;
    --warning: #eab308;
    --border: #2a2a2a;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.6;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .logo {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
  }

  .logo span {
    color: var(--text-primary);
  }

  .hero {
    text-align: center;
    padding: 4rem 2rem;
    background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  }

  .hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--accent) 0%, #fcd34d 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero p {
    font-size: 1.25rem;
    color: var(--text-secondary);
    max-width: 600px;
    margin: 0 auto 2rem;
  }

  .input-group {
    display: flex;
    max-width: 600px;
    margin: 0 auto;
    gap: 0.5rem;
  }

  .input-group input {
    flex: 1;
    padding: 1rem 1.5rem;
    font-size: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    outline: none;
  }

  .input-group input:focus {
    border-color: var(--accent);
  }

  .btn {
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    padding: 4rem 2rem;
  }

  .feature {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 2rem;
  }

  .feature h3 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--accent);
  }

  .feature p {
    color: var(--text-secondary);
  }

  .session-container {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 2rem;
    min-height: calc(100vh - 120px);
    padding: 2rem;
  }

  @media (max-width: 1024px) {
    .session-container {
      grid-template-columns: 1fr;
    }
  }

  .preview-frame {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 1rem;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border);
  }

  .preview-dots {
    display: flex;
    gap: 0.5rem;
  }

  .preview-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .preview-dot.red { background: #ef4444; }
  .preview-dot.yellow { background: #eab308; }
  .preview-dot.green { background: #22c55e; }

  .preview-url {
    flex: 1;
    padding: 0.5rem 1rem;
    background: var(--bg-primary);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-content {
    height: 600px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .preview-content iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .status-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  .status-indicator.initializing { background: var(--warning); }
  .status-indicator.cloning { background: var(--warning); }
  .status-indicator.analyzing { background: var(--warning); }
  .status-indicator.installing { background: var(--warning); }
  .status-indicator.building { background: var(--warning); }
  .status-indicator.starting { background: var(--warning); }
  .status-indicator.running { background: var(--success); }
  .status-indicator.stopped { background: var(--text-secondary); }
  .status-indicator.error { background: var(--error); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-title {
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .log-container {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 1rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }

  .log-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
  }

  .log-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .log-entry {
    margin-bottom: 0.25rem;
  }

  .log-entry .time {
    color: var(--text-secondary);
  }

  .log-entry.info .message { color: var(--text-primary); }
  .log-entry.warn .message { color: var(--warning); }
  .log-entry.error .message { color: var(--error); }
  .log-entry.debug .message { color: var(--text-secondary); }

  .error-page {
    text-align: center;
    padding: 4rem 2rem;
  }

  .error-page h1 {
    font-size: 6rem;
    color: var(--error);
    margin-bottom: 1rem;
  }

  .error-page p {
    color: var(--text-secondary);
    margin-bottom: 2rem;
  }
`;

// Client-side JavaScript for session page
const sessionScript = (sessionId: string) => `
  const sessionId = '${sessionId}';
  let retryCount = 0;
  const maxRetries = 3;

  async function fetchStatus() {
    try {
      const response = await fetch('/api/status/' + sessionId);
      const data = await response.json();
      updateUI(data);
      retryCount = 0;

      if (data.status === 'running' && data.previewUrl) {
        updatePreview(data.previewUrl);
      }

      if (!['stopped', 'error'].includes(data.status)) {
        setTimeout(fetchStatus, 2000);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
      retryCount++;
      if (retryCount < maxRetries) {
        setTimeout(fetchStatus, 3000);
      }
    }
  }

  function updateUI(data) {
    // Update status indicator
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
      indicator.className = 'status-indicator ' + data.status;
    }

    // Update status title
    const title = document.querySelector('.status-title');
    if (title) {
      title.textContent = formatStatus(data.status);
    }

    // Update details
    const details = document.querySelector('.status-details');
    if (details && data.environment) {
      details.innerHTML = \`
        <div>Environment: \${data.environment.name}</div>
        <div>Port: \${data.environment.port}</div>
        \${data.previewUrl ? '<div>Preview: <a href="' + data.previewUrl + '" target="_blank">Open</a></div>' : ''}
      \`;
    }

    // Update logs
    const logContent = document.querySelector('.log-content');
    if (logContent && data.logs) {
      logContent.innerHTML = data.logs.map(log => \`
        <div class="log-entry \${log.level}">
          <span class="time">\${new Date(log.timestamp).toLocaleTimeString()}</span>
          <span class="message">\${escapeHtml(log.message)}</span>
        </div>
      \`).join('');
      logContent.scrollTop = logContent.scrollHeight;
    }

    // Show error if any
    if (data.error) {
      const errorDiv = document.querySelector('.error-message');
      if (errorDiv) {
        errorDiv.textContent = data.error;
        errorDiv.style.display = 'block';
      }
    }
  }

  function updatePreview(url) {
    const previewUrl = document.querySelector('.preview-url');
    const previewContent = document.querySelector('.preview-content');

    if (previewUrl) {
      previewUrl.textContent = url;
    }

    if (previewContent && !previewContent.querySelector('iframe')) {
      previewContent.innerHTML = '<iframe src="' + url + '" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>';
    }
  }

  function formatStatus(status) {
    const statusMap = {
      'initializing': 'Initializing...',
      'cloning': 'Cloning Repository...',
      'analyzing': 'Analyzing Project...',
      'installing': 'Installing Dependencies...',
      'building': 'Building Project...',
      'starting': 'Starting Application...',
      'running': 'Running',
      'stopped': 'Stopped',
      'error': 'Error'
    };
    return statusMap[status] || status;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Start polling
  fetchStatus();
`;

export function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>cloudx.sh - Launch any GitHub repo instantly</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">cloud<span>x.sh</span></a>
    <nav>
      <a href="https://github.com/cloudflare/sandbox-sdk" target="_blank" style="color: var(--text-secondary); text-decoration: none;">GitHub</a>
    </nav>
  </header>

  <section class="hero">
    <h1>Launch any GitHub repo instantly</h1>
    <p>Paste a GitHub URL and get a running development environment in seconds. Powered by Cloudflare Sandbox and Workers AI.</p>

    <form class="input-group" onsubmit="handleSubmit(event)">
      <input
        type="text"
        id="repo-url"
        placeholder="github.com/owner/repo"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="submit" class="btn btn-primary">Launch</button>
    </form>
  </section>

  <section class="features container">
    <div class="feature">
      <h3>AI-Powered Detection</h3>
      <p>Automatically detects your project type, dependencies, and the best way to run it using Workers AI.</p>
    </div>
    <div class="feature">
      <h3>Instant Environments</h3>
      <p>Node.js, Python, Rust, Go, Ruby, PHP - all major runtimes are supported out of the box.</p>
    </div>
    <div class="feature">
      <h3>Live Preview</h3>
      <p>Get a public URL to your running application instantly. Share it with anyone.</p>
    </div>
    <div class="feature">
      <h3>Edge-Powered</h3>
      <p>Built on Cloudflare's global network. Fast, secure, and scalable by default.</p>
    </div>
  </section>

  <script>
    function handleSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('repo-url');
      let url = input.value.trim();

      // Clean up the URL
      url = url.replace(/^https?:\\/\\//, '');
      url = url.replace(/\\.git$/, '');

      if (url.startsWith('github.com/')) {
        window.location.href = '/' + url;
      } else if (url.match(/^[\\w-]+\\/[\\w-]+$/)) {
        window.location.href = '/github.com/' + url;
      } else {
        alert('Please enter a valid GitHub URL or owner/repo');
      }
    }
  </script>
</body>
</html>`;
}

export function renderSessionPage(sessionId: string, owner: string, repo: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${owner}/${repo} - cloudx.sh</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">cloud<span>x.sh</span></a>
    <div style="color: var(--text-secondary);">
      <a href="https://github.com/${owner}/${repo}" target="_blank" style="color: var(--accent); text-decoration: none;">${owner}/${repo}</a>
    </div>
  </header>

  <div class="session-container">
    <div class="preview-frame">
      <div class="preview-header">
        <div class="preview-dots">
          <div class="preview-dot red"></div>
          <div class="preview-dot yellow"></div>
          <div class="preview-dot green"></div>
        </div>
        <div class="preview-url">Loading...</div>
      </div>
      <div class="preview-content">
        <p>Waiting for application to start...</p>
      </div>
    </div>

    <div class="sidebar">
      <div class="status-card">
        <div class="status-header">
          <div class="status-indicator initializing"></div>
          <div class="status-title">Initializing...</div>
        </div>
        <div class="status-details">
          <div>Repository: ${owner}/${repo}</div>
          <div>Session: ${sessionId.slice(0, 8)}...</div>
        </div>
        <div class="error-message" style="display: none; color: var(--error); margin-top: 1rem;"></div>
      </div>

      <div class="log-container">
        <div class="log-header">Logs</div>
        <div class="log-content">
          <div class="log-entry info">
            <span class="time">${new Date().toLocaleTimeString()}</span>
            <span class="message">Starting session...</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>${sessionScript(sessionId)}</script>
</body>
</html>`;
}

export function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - cloudx.sh</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo">cloud<span>x.sh</span></a>
  </header>

  <div class="error-page">
    <h1>Oops!</h1>
    <p>${message}</p>
    <a href="/" class="btn btn-primary">Go Home</a>
  </div>
</body>
</html>`;
}
