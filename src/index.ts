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
  type SandboxOptions,
} from '@cloudflare/sandbox';
import { opencode, type Config } from '@cloudflare/sandbox/opencode';

// Re-export Sandbox for Durable Object
export { Sandbox };

interface Env {
  SANDBOX: DurableObjectNamespace<Sandbox>;
  CACHE: KVNamespace;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

// Configure OpenCode to use Claude Opus 4.5
function getConfig(env: Env): Config {
  return {
    provider: {
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY,
      },
    },
    // Use Claude Opus 4.5 as the model
    model: {
      provider: 'anthropic',
      model: 'claude-opus-4-5-20250514',
    },
  };
}

// Sandbox options for GitHub repo environments
function getSandboxOptions(repoUrl?: string): SandboxOptions {
  return {
    // Keep sandbox alive for 30 minutes of inactivity
    sleepAfter: 30 * 60 * 1000,
    // Start OpenCode server on container start
    startCommand: repoUrl
      ? `cd /home/user && git clone --depth 1 ${repoUrl} repo && cd repo && opencode serve --port 4096`
      : 'opencode serve --port 4096',
  };
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

    // API: Execute a task in an existing sandbox
    if (url.pathname === '/api/task' && request.method === 'POST') {
      return handleTask(request, env);
    }

    // API: Get sandbox status
    if (url.pathname.startsWith('/api/status/')) {
      const sessionId = url.pathname.replace('/api/status/', '');
      return handleStatus(env, sessionId);
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
  const repo = pathParts[2].split('/')[0]; // Handle extra path segments
  const repoFullName = `${owner}/${repo}`;
  const repoUrl = `https://github.com/${repoFullName}.git`;

  // Check for existing session
  const cacheKey = `session:${repoFullName}`;
  const existingSessionId = await env.CACHE.get(cacheKey);

  if (existingSessionId) {
    // Return existing session
    const sessionUrl = `${url.origin}/session/${existingSessionId}`;
    return Response.redirect(sessionUrl, 302);
  }

  // Create new session
  const sessionId = crypto.randomUUID();

  // Get sandbox with repo-specific options
  const sandbox = getSandbox(env.SANDBOX, sessionId, getSandboxOptions(repoUrl));

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

  // Initialize sandbox in background
  ctx.waitUntil(initializeSandbox(env, sandbox, sessionId, repoFullName, repoUrl));

  // Redirect to session page
  return Response.redirect(`${url.origin}/session/${sessionId}`, 302);
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

    // Wait for the sandbox to be ready and repo to be cloned
    // The startCommand in getSandboxOptions handles the clone
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Verify clone succeeded
    const result = await sandbox.exec('ls -la /home/user/repo', { timeout: 5000 });

    if (!result.success) {
      throw new Error('Failed to clone repository');
    }

    // Update status to running
    await updateSessionStatus(env, sessionId, 'running');

    // Expose OpenCode port
    try {
      const portInfo = await sandbox.exposePort(4096);
      await env.CACHE.put(
        `preview:${sessionId}`,
        portInfo.url,
        { expirationTtl: 7200 }
      );
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

async function handleTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      sessionId?: string;
      repo?: string;
      task: string;
    };

    if (!body.task) {
      return Response.json({ error: 'Task is required' }, { status: 400 });
    }

    // Get or create session
    let sessionId = body.sessionId;
    if (!sessionId && body.repo) {
      sessionId = await env.CACHE.get(`session:${body.repo}`);
    }

    if (!sessionId) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get sandbox
    const sandbox = getSandbox(env.SANDBOX, sessionId);

    // Create OpenCode client with Claude Opus 4.5
    const client = opencode(sandbox, getConfig(env));

    // Create session and send task
    const session = await client.session.create();

    const response = await session.send({
      message: body.task,
    });

    // Extract text from response
    const textParts = response.message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text);

    return Response.json({
      success: true,
      sessionId,
      response: textParts.join('\n'),
      usage: response.usage,
    });
  } catch (error) {
    console.error('Task execution failed:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
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
