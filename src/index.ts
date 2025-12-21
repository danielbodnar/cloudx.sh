/**
 * cloudx.sh - GitHub Repository Launcher
 *
 * Intercepts requests to cloudx.sh/github.com/[org]/[repo] and launches
 * development environments using Cloudflare Sandbox SDK and OpenCode with Claude Opus 4.5
 */

import {
  Sandbox,
  getSandbox,
  proxyToSandbox,
} from '@cloudflare/sandbox';

// Re-export Sandbox for Durable Object
export { Sandbox };

interface Env {
  SANDBOX: DurableObjectNamespace<Sandbox>;
  CACHE: KVNamespace;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

// Validate GitHub owner/repo names to prevent command injection
// GitHub usernames: alphanumeric + hyphens, 1-39 chars, no consecutive hyphens, can't start/end with hyphen
// Repo names: alphanumeric + hyphens + underscores + dots, 1-100 chars
const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_REGEX = /^[a-zA-Z0-9._-]{1,100}$/;

function isValidGitHubOwner(owner: string): boolean {
  return GITHUB_OWNER_REGEX.test(owner) && !owner.includes('--');
}

function isValidGitHubRepo(repo: string): boolean {
  return GITHUB_REPO_REGEX.test(repo) && repo !== '.' && repo !== '..';
}

function sanitizeForShell(input: string): string {
  // Only allow safe characters for shell commands
  return input.replace(/[^a-zA-Z0-9._-]/g, '');
}

// Validate UUID format for session IDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSessionId(sessionId: string): boolean {
  return UUID_REGEX.test(sessionId);
}

// Check if a GitHub repository is publicly accessible
async function isRepoPublic(owner: string, repo: string): Promise<{ accessible: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cloudx.sh',
      },
    });

    if (response.status === 200) {
      const data = await response.json() as { private?: boolean };
      if (data.private) {
        return { accessible: false, error: 'This repository is private. Only public repositories are supported.' };
      }
      return { accessible: true };
    } else if (response.status === 404) {
      return { accessible: false, error: 'Repository not found. Please check the owner and repository name.' };
    } else if (response.status === 403) {
      // Rate limited - allow the clone attempt anyway
      return { accessible: true };
    } else {
      return { accessible: false, error: `Failed to verify repository (HTTP ${response.status})` };
    }
  } catch (error) {
    // Network error - allow the clone attempt anyway
    console.error('Failed to check repository accessibility:', error);
    return { accessible: true };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'cloudx.sh' });
    }

    // API: Launch a new sandbox for a GitHub repo
    if (url.pathname.startsWith('/github.com/')) {
      return handleGitHubLaunch(request, env, ctx, url);
    }

    // API: Get sandbox status
    if (url.pathname.startsWith('/api/status/')) {
      const sessionId = url.pathname.replace('/api/status/', '');
      if (!isValidSessionId(sessionId)) {
        return Response.json({ error: 'Invalid session ID' }, { status: 400 });
      }
      return handleStatus(env, sessionId);
    }

    // Session page - show status and redirect to OpenCode
    if (url.pathname.startsWith('/session/')) {
      const sessionId = url.pathname.replace('/session/', '');
      if (!isValidSessionId(sessionId)) {
        return new Response('Invalid session ID', { status: 400 });
      }
      return handleSessionPage(env, sessionId, url.origin);
    }

    // Proxy OpenCode UI requests to sandbox
    const proxyResponse = await proxyToSandbox(request, env);
    if (proxyResponse) {
      return proxyResponse;
    }

    // Home page
    if (url.pathname === '/') {
      return new Response(renderHomePage(), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleGitHubLaunch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL
): Promise<Response> {
  // Parse GitHub URL: /github.com/owner/repo
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length < 3 || pathParts[0] !== 'github.com') {
    return Response.json({ error: 'Invalid GitHub URL format' }, { status: 400 });
  }

  const owner = pathParts[1];
  const repo = pathParts[2].split('/')[0];

  // Validate owner and repo to prevent command injection
  if (!isValidGitHubOwner(owner)) {
    return Response.json({ error: 'Invalid GitHub owner name' }, { status: 400 });
  }
  if (!isValidGitHubRepo(repo)) {
    return Response.json({ error: 'Invalid GitHub repository name' }, { status: 400 });
  }

  // Check if repository is publicly accessible before proceeding
  const repoCheck = await isRepoPublic(owner, repo);
  if (!repoCheck.accessible) {
    return Response.json({ error: repoCheck.error }, { status: 400 });
  }

  // Use the original validated values as the canonical repository identifier
  const repoFullName = `${owner}/${repo}`;
  const repoUrl = `https://github.com/${repoFullName}.git`;

  const cacheKey = `session:${repoFullName}`;
  const lockKey = `lock:${repoFullName}`;

  // Check for existing session first
  const existingSessionId = await env.CACHE.get(cacheKey);
  if (existingSessionId) {
    return Response.redirect(`${url.origin}/session/${existingSessionId}`, 302);
  }

  // Try to acquire a lock to prevent race conditions
  // Use a short TTL lock that expires if the process fails
  const lockValue = crypto.randomUUID();
  let existingLock = await env.CACHE.get(lockKey);

  if (existingLock) {
    // Another request is creating a session; wait (with timeout) and check again
    const maxWaitMs = 5000;
    const pollIntervalMs = 500;
    const start = Date.now();
    let timedOut = false;

    while (true) {
      // Check if we've waited too long
      if (Date.now() - start >= maxWaitMs) {
        timedOut = true;
        break;
      }

      // Wait before re-checking
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      // If a session has been created, redirect to it
      const sessionId = await env.CACHE.get(cacheKey);
      if (sessionId) {
        return Response.redirect(`${url.origin}/session/${sessionId}`, 302);
      }

      // Check if the lock is still present; if not, we can try to acquire it
      existingLock = await env.CACHE.get(lockKey);
      if (!existingLock) {
        break;
      }
    }

    // If we timed out and there's still no session, return an error
    if (timedOut) {
      const finalSessionId = await env.CACHE.get(cacheKey);
      if (finalSessionId) {
        return Response.redirect(`${url.origin}/session/${finalSessionId}`, 302);
      }
      return Response.json(
        { error: 'Session creation in progress, please retry' },
        { status: 503 }
      );
    }
  }

  // Set lock with short expiration (30 seconds)
  await env.CACHE.put(lockKey, lockValue, { expirationTtl: 60 });

  try {
    // Double-check no session was created while we were acquiring lock
    const recheckSession = await env.CACHE.get(cacheKey);
    if (recheckSession) {
      await env.CACHE.delete(lockKey);
      return Response.redirect(`${url.origin}/session/${recheckSession}`, 302);
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    const sandbox = getSandbox(env.SANDBOX, sessionId);

    // Store session mapping
    await env.CACHE.put(cacheKey, sessionId, { expirationTtl: 7200 });
    await env.CACHE.put(
      `info:${sessionId}`,
      JSON.stringify({
        id: sessionId,
        repo: repoFullName,
        repoUrl,
        createdAt: Date.now(),
        status: 'initializing',
      }),
      { expirationTtl: 7200 }
    );

    // Release lock
    await env.CACHE.delete(lockKey);

    // Initialize sandbox in background
    ctx.waitUntil(initializeSandbox(env, sandbox, sessionId, repoFullName, repoUrl));

    // Redirect to session page
    return Response.redirect(`${url.origin}/session/${sessionId}`, 302);
  } catch (error) {
    // Release lock on error
    await env.CACHE.delete(lockKey);
    throw error;
  }
}

async function initializeSandbox(
  env: Env,
  sandbox: Sandbox,
  sessionId: string,
  repoFullName: string,
  repoUrl: string
): Promise<void> {
  try {
    // Update status
    await updateSessionStatus(env, sessionId, 'cloning');

    // Clone the repository using the SDK's gitCheckout method (safer than shell exec)
    await sandbox.gitCheckout(repoUrl, {
      targetDir: '/home/user/repo',
      depth: 1,
    });

    await updateSessionStatus(env, sessionId, 'starting');

    // Write OpenCode config with Claude Opus 4.5
    const configContent = JSON.stringify({
      provider: {
        anthropic: {
          apiKey: env.ANTHROPIC_API_KEY,
        },
      },
      model: {
        provider: 'anthropic',
        model: 'claude-opus-4-5-20250514',
      },
    }, null, 2);

    await sandbox.writeFile('/home/user/repo/.opencode.json', configContent);

    // Start OpenCode server
    await sandbox.exec(
      'cd /home/user/repo && nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &',
      { timeout: 30000 }
    );

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Update status to running
    await updateSessionStatus(env, sessionId, 'running');

    // Expose OpenCode port
    try {
      const portInfo = await sandbox.exposePort(4096);
      await env.CACHE.put(`preview:${sessionId}`, portInfo.url, { expirationTtl: 7200 });
    } catch (e) {
      console.error('Failed to expose port:', e);
    }
  } catch (error) {
    console.error('Sandbox initialization failed:', error);
    await updateSessionStatus(env, sessionId, 'error', String(error));
  }
}

async function updateSessionStatus(
  env: Env,
  sessionId: string,
  status: string,
  error?: string
): Promise<void> {
  const infoKey = `info:${sessionId}`;
  const existing = await env.CACHE.get(infoKey, 'json') as Record<string, unknown> | null;

  if (existing) {
    await env.CACHE.put(
      infoKey,
      JSON.stringify({
        ...existing,
        status,
        error,
        updatedAt: Date.now(),
      }),
      { expirationTtl: 7200 }
    );
  }
}

async function handleStatus(env: Env, sessionId: string): Promise<Response> {
  const info = await env.CACHE.get(`info:${sessionId}`, 'json');
  const previewUrl = await env.CACHE.get(`preview:${sessionId}`);

  if (!info) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json({
    ...info,
    previewUrl,
  });
}

async function handleSessionPage(env: Env, sessionId: string, origin: string): Promise<Response> {
  const info = await env.CACHE.get(`info:${sessionId}`, 'json') as Record<string, unknown> | null;
  const previewUrl = await env.CACHE.get(`preview:${sessionId}`);

  if (!info) {
    return new Response('Session not found', { status: 404 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${info.repo} - cloudx.sh</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 600px; text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #f97316; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #1a1a1a;
      border-radius: 2rem;
      margin-bottom: 2rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .status-dot.initializing, .status-dot.cloning, .status-dot.starting { background: #eab308; }
    .status-dot.running { background: #22c55e; }
    .status-dot.error { background: #ef4444; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .preview-link {
      display: inline-block;
      padding: 1rem 2rem;
      background: #f97316;
      color: #fff;
      text-decoration: none;
      border-radius: 0.5rem;
      font-weight: 600;
      margin-top: 1rem;
    }
    .preview-link:hover { background: #fb923c; }
    .preview-link.disabled {
      background: #333;
      pointer-events: none;
    }
    .info { color: #888; margin-top: 2rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${info.repo}</h1>
    <div class="status">
      <div class="status-dot ${info.status}"></div>
      <span id="status-text">${formatStatus(info.status as string)}</span>
    </div>

    ${previewUrl
      ? `<a href="${previewUrl}" target="_blank" class="preview-link">Open in OpenCode</a>`
      : `<a class="preview-link disabled">Starting OpenCode...</a>`
    }

    <p class="info">
      Session ID: ${sessionId.slice(0, 8)}...<br>
      Powered by Claude Opus 4.5
    </p>
  </div>

  <script>
    const sessionId = '${sessionId}';
    async function checkStatus() {
      try {
        const res = await fetch('/api/status/' + sessionId);
        const data = await res.json();
        document.getElementById('status-text').textContent = formatStatus(data.status);
        document.querySelector('.status-dot').className = 'status-dot ' + data.status;

        if (data.previewUrl && data.status === 'running') {
          const link = document.querySelector('.preview-link');
          link.href = data.previewUrl;
          link.textContent = 'Open in OpenCode';
          link.classList.remove('disabled');
        }

        if (data.status !== 'running' && data.status !== 'error') {
          setTimeout(checkStatus, 2000);
        }
      } catch (e) {
        console.error('Status check failed:', e);
        setTimeout(checkStatus, 3000);
      }
    }

    function formatStatus(status) {
      const map = {
        initializing: 'Initializing...',
        cloning: 'Cloning repository...',
        starting: 'Starting OpenCode...',
        running: 'Running',
        error: 'Error'
      };
      return map[status] || status;
    }

    if ('${info.status}' !== 'running') {
      setTimeout(checkStatus, 2000);
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    initializing: 'Initializing...',
    cloning: 'Cloning repository...',
    starting: 'Starting OpenCode...',
    running: 'Running',
    error: 'Error',
  };
  return map[status] || status;
}

function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>cloudx.sh - Launch any GitHub repo instantly</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container { max-width: 600px; text-align: center; }
    h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #f97316, #fcd34d);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p { color: #a0a0a0; font-size: 1.25rem; margin-bottom: 2rem; }
    .input-group {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    input {
      flex: 1;
      padding: 1rem;
      font-size: 1rem;
      border: 1px solid #333;
      border-radius: 0.5rem;
      background: #1a1a1a;
      color: #fff;
      outline: none;
    }
    input:focus { border-color: #f97316; }
    button {
      padding: 1rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: 0.5rem;
      background: #f97316;
      color: #fff;
      cursor: pointer;
    }
    button:hover { background: #fb923c; }
    .features {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      text-align: left;
      margin-top: 3rem;
    }
    .feature {
      background: #141414;
      border: 1px solid #222;
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .feature h3 { color: #f97316; margin-bottom: 0.5rem; }
    .feature p { font-size: 0.875rem; color: #888; }
    .powered-by {
      margin-top: 3rem;
      color: #666;
      font-size: 0.875rem;
    }
    .powered-by a { color: #f97316; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>cloudx.sh</h1>
    <p>Launch any GitHub repository as an AI-powered development environment instantly.</p>

    <form class="input-group" onsubmit="handleSubmit(event)">
      <input
        type="text"
        id="repo-url"
        placeholder="github.com/owner/repo"
        autocomplete="off"
      />
      <button type="submit">Launch</button>
    </form>

    <div class="features">
      <div class="feature">
        <h3>Claude Opus 4.5</h3>
        <p>Powered by Anthropic's most capable model for intelligent code assistance.</p>
      </div>
      <div class="feature">
        <h3>OpenCode</h3>
        <p>Full-featured AI development environment with terminal, editor, and chat.</p>
      </div>
      <div class="feature">
        <h3>Instant Setup</h3>
        <p>Automatic dependency detection and installation for any project.</p>
      </div>
      <div class="feature">
        <h3>Edge-Powered</h3>
        <p>Runs on Cloudflare's global network for fast, secure execution.</p>
      </div>
    </div>

    <p class="powered-by">
      Powered by <a href="https://developers.cloudflare.com/sandbox/">Cloudflare Sandbox</a>
      and <a href="https://opencode.ai">OpenCode</a>
    </p>
  </div>

  <script>
    function handleSubmit(e) {
      e.preventDefault();
      let url = document.getElementById('repo-url').value.trim();
      url = url.replace(/^https?:\\/\\//, '').replace(/\\.git$/, '');
      if (url.startsWith('github.com/')) {
        window.location.href = '/' + url;
      } else if (url.match(/^[\\w-]+\\/[\\w.-]+$/)) {
        window.location.href = '/github.com/' + url;
      } else {
        alert('Please enter a valid GitHub URL or owner/repo');
      }
    }
  </script>
</body>
</html>`;
}
