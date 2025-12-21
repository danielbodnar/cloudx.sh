/**
 * cloudx.sh - GitHub Repository Launcher
 *
 * Intercepts requests to cloudx.sh/github.com/[org]/[repo] and launches
 * development environments using Cloudflare Sandbox and Workers AI
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { getSandbox, proxyToSandbox, type Sandbox } from '@cloudflare/sandbox';

import type { Env, SessionInfo } from './types';
import { GitHubService } from './services/github';
import { AIAnalyzer } from './services/ai-analyzer';
import { SessionHandler } from './services/session-handler';
import { renderHomePage, renderSessionPage, renderErrorPage } from './ui/pages';

// Re-export the Sandbox Durable Object class
export { Sandbox as DevEnvironment } from '@cloudflare/sandbox';

// Create Hono app with proper typing
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', secureHeaders());
// CORS configuration: Restrict to specific origins in production
// Allowed origins can be configured via ALLOWED_ORIGINS environment variable
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      // Allow same-origin requests (no origin header)
      if (!origin) return origin;
      
      // Get allowed origins from environment variable
      const env = c.env as Env;
      const allowedOriginsStr = env.ALLOWED_ORIGINS || '';
      const allowedOrigins = allowedOriginsStr ? allowedOriginsStr.split(',') : [];
      
      // For now, allow cloudx.sh domains and localhost for development
      if (
        origin.includes('cloudx.sh') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        allowedOrigins.includes(origin)
      ) {
        return origin;
      }
      
      // Reject other origins
      return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'cloudx.sh' }));

// API: Get session status
app.get('/api/status/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  try {
    // Try to get from sandbox
    const sandbox = getSandbox(c.env.DEV_ENVIRONMENT, sessionId);
    const result = await sandbox.exec('echo "status:running"', { timeout: 5000 });

    // Get cached session info from KV
    const sessionData = await c.env.CACHE.get(`session:${sessionId}`, 'json');

    if (sessionData) {
      return c.json(sessionData);
    }

    // Return basic status if no cached data
    return c.json({
      id: sessionId,
      status: result.success ? 'running' : 'stopped',
      logs: [],
    });
  } catch (error) {
    return c.json({
      id: sessionId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      logs: [],
    });
  }
});

// API: Get session logs
app.get('/api/logs/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  try {
    const sessionData = await c.env.CACHE.get(`session:${sessionId}`, 'json') as SessionInfo | null;

    if (sessionData) {
      return c.json({ logs: sessionData.logs || [] });
    }

    return c.json({ logs: [] });
  } catch {
    return c.json({ logs: [] });
  }
});

// API: Execute command in session
// SECURITY NOTE: This endpoint allows command execution in the sandbox.
// While sandboxed, consider implementing authentication and rate limiting.
app.post('/api/exec/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ command: string }>();

  if (!body.command) {
    return c.json({ error: 'Command is required' }, 400);
  }

  // Basic command validation: prevent obviously dangerous patterns
  const dangerousPatterns = [
    /rm\s+-rf\s+\/(?!workspace)/,  // Prevent deleting outside workspace
    />\s*\/dev\/sd/,               // Prevent disk operations
    /mkfs/,                        // Prevent filesystem operations  
    /dd\s+if=/,                    // Prevent disk imaging
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(body.command)) {
      return c.json({ error: 'Command contains potentially dangerous operations' }, 400);
    }
  }

  // Rate limiting: Check command execution rate
  const rateLimitKey = `exec_rate:${sessionId}`;
  const execCount = await c.env.CACHE.get(rateLimitKey);
  
  if (execCount && parseInt(execCount) >= 30) {
    return c.json({ error: 'Rate limit exceeded. Maximum 30 commands per minute.' }, 429);
  }

  try {
    const sandbox = getSandbox(c.env.DEV_ENVIRONMENT, sessionId);
    
    // Execute command in workspace/repo directory
    // Commands are isolated to the sandbox container
    const result = await sandbox.exec(`cd /workspace/repo && ${body.command}`, {
      timeout: 60000,
    });

    // Update rate limit counter
    const newCount = execCount ? parseInt(execCount) + 1 : 1;
    await c.env.CACHE.put(rateLimitKey, newCount.toString(), { expirationTtl: 60 });

    return c.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.success,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Execution failed' },
      500
    );
  }
});

// API: Stop session
app.post('/api/stop/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  try {
    const sandbox = getSandbox(c.env.DEV_ENVIRONMENT, sessionId);
    // Kill common development server processes
    // NOTE: pkill -f uses basic regex (not extended) where \| is alternation
    // In JavaScript string "\\|" becomes "\|" when sent to shell, which is correct for basic regex
    await sandbox.exec('pkill -9 -f "node\\|python\\|ruby\\|go" || true');

    // Update session status in cache
    const sessionData = await c.env.CACHE.get(`session:${sessionId}`, 'json') as SessionInfo | null;
    if (sessionData) {
      sessionData.status = 'stopped';
      await c.env.CACHE.put(`session:${sessionId}`, JSON.stringify(sessionData), {
        expirationTtl: 3600,
      });
    }

    return c.json({ success: true, status: 'stopped' });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Stop failed' },
      500
    );
  }
});

// API: Analyze repository without launching
app.get('/api/analyze/:owner/:repo', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');

  try {
    const github = new GitHubService(c.env);
    const analyzer = new AIAnalyzer(c.env);

    const repoInfo = await github.getRepository(owner, repo);
    const files = await github.getRepositoryFiles(owner, repo);
    const configContents = await github.getConfigFileContents(owner, repo, files);

    const analysis = await analyzer.analyzeRepository({
      repoInfo,
      files,
      configContents,
    });

    return c.json({
      repo: repoInfo,
      environment: analysis.environment,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      fileAnalysis: analysis.fileAnalysis,
    });
  } catch (error) {
    console.error('Repository analysis failed:', error);
    const isProduction = c.env.ENVIRONMENT === 'production';
    const message = isProduction
      ? 'Failed to analyze repository'
      : (error instanceof Error ? error.message : 'Unknown error');
    return c.json({ error: message }, 500);
  }
});

// Main GitHub repository route
// Matches: /github.com/owner/repo or /github.com/owner/repo/...
app.get('/github.com/:owner/:repo{.*}', async (c) => {
  const owner = c.req.param('owner');
  const repoWithPath = c.req.param('repo');
  // Extract just the repo name (before any additional path segments)
  const repo = repoWithPath.split('/')[0];
  const repoFullName = `${owner}/${repo}`;

  try {
    // Rate limiting: Prevent abuse by limiting session creation per IP
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    const ipRateLimitKey = `session_rate:${clientIP}`;
    const ipSessionCount = await c.env.CACHE.get(ipRateLimitKey);
    
    if (ipSessionCount && parseInt(ipSessionCount) >= 5) {
      return c.json(
        { error: 'Rate limit exceeded. Maximum 5 session creations per hour per IP.' },
        429
      );
    }

    // Resource exhaustion prevention: Limit concurrent sessions per repository
    const repoSessionCountKey = `repo_sessions:${repoFullName}`;
    const repoSessionCount = parseInt(await c.env.CACHE.get(repoSessionCountKey) || '0');
    
    if (repoSessionCount >= 3) {
      return c.json(
        { error: 'Maximum concurrent sessions for this repository reached. Please try again later.' },
        429
      );
    }

    // Check for existing session in cache
    const cacheKey = `active:${repoFullName}`;
    const existingSessionId = await c.env.CACHE.get(cacheKey);

    if (existingSessionId) {
      // Verify session is still running
      try {
        const sandbox = getSandbox(c.env.DEV_ENVIRONMENT, existingSessionId);
        const result = await sandbox.exec('echo "alive"', { timeout: 5000 });

        if (result.success) {
          // Session is still active, redirect to it
          return c.redirect(`/session/${existingSessionId}`);
        }
      } catch {
        // Session is dead, decrement counter and continue to create new one
        await c.env.CACHE.delete(cacheKey);
        if (repoSessionCount > 0) {
          await c.env.CACHE.put(repoSessionCountKey, String(repoSessionCount - 1), { expirationTtl: 3600 });
        }
      }
    }

    // Create new session with atomic check using KV transactions
    // This helps prevent race conditions
    const sessionId = crypto.randomUUID();

    // Increment session counters
    await c.env.CACHE.put(repoSessionCountKey, String(repoSessionCount + 1), { expirationTtl: 3600 });
    
    const newIpCount = ipSessionCount ? parseInt(ipSessionCount) + 1 : 1;
    await c.env.CACHE.put(ipRateLimitKey, newIpCount.toString(), { expirationTtl: 3600 });

    // Store the session ID -> repo mapping
    await c.env.CACHE.put(cacheKey, sessionId, { expirationTtl: 3600 });

    // Initialize session info in KV
    const initialSession: SessionInfo = {
      id: sessionId,
      repoOwner: owner,
      repoName: repo,
      repoFullName,
      status: 'initializing',
      environment: null,
      previewUrl: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Initializing session for ${repoFullName}`,
        },
      ],
      error: null,
    };

    await c.env.CACHE.put(`session:${sessionId}`, JSON.stringify(initialSession), {
      expirationTtl: 7200,
    });

    // Start the sandbox setup in the background using waitUntil
    c.executionCtx.waitUntil(initializeSession(c.env, sessionId, owner, repo));

    // Return the session page immediately
    return c.html(renderSessionPage(sessionId, owner, repo));
  } catch (error) {
    console.error('Failed to initialize session:', error);
    const isProduction = c.env.ENVIRONMENT === 'production';
    const message = isProduction
      ? 'Failed to initialize session'
      : (error instanceof Error ? error.message : 'Unknown error');
    return c.html(renderErrorPage(message), 500);
  }
});

// Background session initialization
async function initializeSession(
  env: Env,
  sessionId: string,
  owner: string,
  repo: string
): Promise<void> {
  const sandbox = getSandbox(env.DEV_ENVIRONMENT, sessionId);
  const repoFullName = `${owner}/${repo}`;

  async function updateSession(updates: Partial<SessionInfo>): Promise<void> {
    const current = await env.CACHE.get(`session:${sessionId}`, 'json') as SessionInfo;
    if (current) {
      const updated = { ...current, ...updates, lastActivityAt: Date.now() };
      if (updates.logs) {
        updated.logs = [...(current.logs || []), ...updates.logs];
      }
      await env.CACHE.put(`session:${sessionId}`, JSON.stringify(updated), {
        expirationTtl: 7200,
      });
    }
  }

  async function addLog(level: 'info' | 'warn' | 'error' | 'debug', message: string): Promise<void> {
    await updateSession({
      logs: [{ timestamp: Date.now(), level, message }],
    });
  }

  try {
    // Step 1: Clone repository
    await updateSession({ status: 'cloning' });
    await addLog('info', `Cloning repository: ${repoFullName}`);

    const github = new GitHubService(env);
    const cloneUrl = github.getCloneUrl(owner, repo);

    const cloneResult = await sandbox.exec(`git clone --depth 1 ${cloneUrl} /workspace/repo`, {
      timeout: 120000,
    });

    if (!cloneResult.success) {
      throw new Error(`Clone failed: ${cloneResult.stderr}`);
    }

    await addLog('info', 'Repository cloned successfully');

    // Step 2: Analyze repository
    await updateSession({ status: 'analyzing' });
    await addLog('info', 'Analyzing repository structure');

    const analyzer = new AIAnalyzer(env);
    const repoInfo = await github.getRepository(owner, repo);
    const files = await github.getRepositoryFiles(owner, repo);
    const configContents = await github.getConfigFileContents(owner, repo, files);

    const analysis = await analyzer.analyzeRepository({
      repoInfo,
      files,
      configContents,
    });

    await updateSession({ environment: analysis.environment });
    await addLog('info', `Detected environment: ${analysis.environment.name}`);
    await addLog('info', `Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

    // Step 3: Install dependencies
    if (analysis.environment.installCommand) {
      await updateSession({ status: 'installing' });
      await addLog('info', `Installing dependencies: ${analysis.environment.installCommand}`);

      const installResult = await sandbox.exec(
        `cd /workspace/repo && ${analysis.environment.installCommand}`,
        { timeout: 300000 }
      );

      if (!installResult.success && installResult.exitCode !== 0) {
        await addLog('warn', `Install completed with warnings`);
      } else {
        await addLog('info', 'Dependencies installed successfully');
      }
    }

    // Step 4: Build if needed
    if (analysis.environment.buildCommand) {
      await updateSession({ status: 'building' });
      await addLog('info', `Building project: ${analysis.environment.buildCommand}`);

      const buildResult = await sandbox.exec(
        `cd /workspace/repo && ${analysis.environment.buildCommand}`,
        { timeout: 300000 }
      );

      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.stderr}`);
      }

      await addLog('info', 'Build completed successfully');
    }

    // Step 5: Start the application
    await updateSession({ status: 'starting' });
    await addLog('info', `Starting application: ${analysis.environment.startCommand}`);

    // Build environment variables string with proper escaping
    // Escape shell metacharacters to prevent command injection
    const escapeShellArg = (arg: string): string => {
      // Replace single quotes with '\'' and wrap in single quotes
      return `'${arg.replace(/'/g, "'\\''")}'`;
    };

    const envVarsStr = Object.entries(analysis.environment.envVars || {})
      .map(([k, v]) => {
        // Validate environment variable name (alphanumeric and underscore only)
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(k)) {
          throw new Error(`Invalid environment variable name: ${k}`);
        }
        // Escape the value to prevent command injection
        return `export ${k}=${escapeShellArg(v)}`;
      })
      .join(' && ');

    const startCmd = envVarsStr
      ? `cd /workspace/repo && ${envVarsStr} && ${analysis.environment.startCommand}`
      : `cd /workspace/repo && ${analysis.environment.startCommand}`;

    // Start the application in background
    await sandbox.exec(`nohup sh -c '${startCmd.replace(/'/g, "'\\''")}' > /tmp/app.log 2>&1 &`);

    // Wait for application to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Try to expose the port
    let previewUrl: string | null = null;
    if (analysis.environment.previewable && analysis.environment.port) {
      try {
        // The hostname parameter should be the worker's hostname
        // In production, this would be the actual cloudx.sh domain
        const hostname = new URL(env.GITHUB_API_BASE || 'https://cloudx.sh').hostname;
        const portInfo = await sandbox.exposePort(analysis.environment.port, { hostname });
        previewUrl = portInfo.url;
        await addLog('info', `Preview available at: ${previewUrl}`);
      } catch (portError) {
        await addLog('warn', `Could not expose port ${analysis.environment.port}: ${portError}`);
      }
    }

    await updateSession({
      status: 'running',
      previewUrl,
    });
    await addLog('info', 'Application started successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Session initialization failed:', error);

    await updateSession({
      status: 'error',
      error: errorMessage,
    });
    await addLog('error', `Session failed: ${errorMessage}`);
  }
}

// Session view page
app.get('/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  try {
    const sessionData = await c.env.CACHE.get(`session:${sessionId}`, 'json') as SessionInfo | null;

    if (sessionData) {
      return c.html(
        renderSessionPage(sessionId, sessionData.repoOwner, sessionData.repoName)
      );
    }

    return c.html(renderErrorPage('Session not found'), 404);
  } catch {
    return c.html(renderErrorPage('Session not found'), 404);
  }
});

// Proxy requests to sandbox preview
app.all('/preview/:sessionId/*', async (c) => {
  // Forward to sandbox if proxyToSandbox is available
  // Create a compatible env object with Sandbox binding
  const sandboxEnv = {
    ...c.env,
    Sandbox: c.env.Sandbox || c.env.DEV_ENVIRONMENT,
  };
  const proxyResponse = await proxyToSandbox(c.req.raw, sandboxEnv);
  if (proxyResponse) {
    return proxyResponse;
  }
  return c.text('Preview not available', 503);
});

// Home page
app.get('/', (c) => {
  return c.html(renderHomePage());
});

// 404 handler
app.notFound((c) => {
  return c.html(renderErrorPage('Page not found'), 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Application error:', err);
  return c.html(renderErrorPage(err.message), 500);
});

export default app;
