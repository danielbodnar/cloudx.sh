# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Resources

**Always consult the Cloudflare Docs MCP when working on this repository.** The MCP provides comprehensive documentation about:

- Cloudflare Workers API patterns and examples
- Cloudflare Sandbox SDK usage and architecture
- Durable Objects and Containers configuration
- Wrangler configuration reference
- Production deployment requirements

Use the MCP tools (e.g., `mcp__cloudflare-docs__search_cloudflare_documentation`) to search for specific topics before making changes.

**Always use the `gh` CLI for GitHub interactions.** When you need to access GitHub issues, PRs, repository information, or any GitHub-related data, use the gh CLI tool (e.g., `gh issue view`, `gh pr view`, `gh repo view`) instead of trying to fetch GitHub URLs directly.

## Project Skills

This repository includes project-specific skills in `.claude/skills/`:

- **git-commit**: Use when creating commits to follow project commit message standards
- **sandbox-usage**: Use when working with the Cloudflare Sandbox SDK, container lifecycle, or session management

## Project Overview

**cloudx.sh** is a GitHub repository launcher that creates instant AI-powered development environments. Users visit `cloudx.sh/github.com/owner/repo` and get an isolated development environment powered by:

- **Cloudflare Sandbox SDK**: Secure, isolated container execution
- **OpenCode**: AI-powered development interface
- **Claude Opus 4.5**: Anthropic's most capable model for code assistance

### How It Works

1. User visits `cloudx.sh/github.com/owner/repo`
2. Worker validates the GitHub URL (security: prevents command injection)
3. Creates a new Sandbox session via Durable Object
4. Clones the repository into the container
5. Starts OpenCode server with Claude Opus 4.5
6. Redirects user to the development environment

### Custom Domains

The service runs on multiple domains:
- cloudx.sh (primary)
- vmspawn.sh / vmspawn.dev
- nspawn.sh / nspawn.dev

## Architecture

### Single-Worker Architecture

```
User Request → Worker → Sandbox Durable Object → Container (OpenCode + Repo)
                 ↓
              KV Cache (session mapping)
```

### Key Components

1. **`src/index.ts`** - Main Worker entry point
   - Route handling for GitHub URLs, sessions, and health checks
   - Input validation (GitHub owner/repo, session IDs)
   - Session creation with race condition protection
   - Proxy to sandbox for OpenCode UI

2. **`Dockerfile`** - Container image definition
   - Based on `cloudflare/sandbox:latest`
   - Includes OpenCode CLI, Python, Node.js, Bun
   - Pre-configured Git settings

3. **`wrangler.jsonc`** - Cloudflare configuration
   - Durable Objects binding (SANDBOX)
   - KV namespace for session caching
   - Container configuration
   - Custom domain routes

### Security Features

- **Input Validation**: GitHub owner/repo names validated against strict regex patterns
- **Session ID Validation**: UUIDs validated before use
- **Race Condition Protection**: Lock mechanism prevents duplicate session creation
- **Safe Git Operations**: Uses `sandbox.gitCheckout()` instead of shell exec

## Development Commands

### Building & Deploying

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server (requires Docker)
npm run deploy           # Deploy to Cloudflare
```

### Code Quality

```bash
npm run check            # TypeScript type checking
```

### Docker Requirements

Local development requires Docker running for the container runtime. The Dockerfile is built and pushed to Cloudflare's registry on deploy.

## Development Workflow

### Pull Request Process

1. Make your changes
2. Ensure TypeScript compiles: `npm run check`
3. Test locally with `npm run dev` if Docker is available
4. Commit with clear, imperative messages (see git-commit skill)
5. Push and create PR
6. Deploy after review

### Environment Variables

Required secrets (configured in Cloudflare dashboard):
- `ANTHROPIC_API_KEY`: API key for Claude Opus 4.5

## Key Patterns

### Session Management

Sessions are cached in KV with 2-hour TTL:
- `session:{owner}/{repo}` → session ID
- `info:{sessionId}` → session metadata (status, timestamps)
- `preview:{sessionId}` → OpenCode preview URL
- `lock:{owner}/{repo}` → temporary lock for race condition prevention

### Status Flow

```
initializing → cloning → starting → running
                                  ↘ error
```

### Sandbox SDK Usage

```typescript
import { Sandbox, getSandbox, proxyToSandbox } from '@cloudflare/sandbox';

// Get sandbox instance for a session
const sandbox = getSandbox(env.SANDBOX, sessionId);

// Clone repository (safe method, no shell injection)
await sandbox.gitCheckout(repoUrl, {
  targetDir: '/home/user/repo',
  depth: 1,
});

// Write configuration files
await sandbox.writeFile('/path/to/file', content);

// Execute commands
await sandbox.exec('command here', { timeout: 30000 });

// Expose ports for preview URLs
const portInfo = await sandbox.exposePort(4096);
```

## Coding Standards

### TypeScript

- **Never use `any` type** - define proper types
- Use strict null checks
- Validate all external inputs

### Security

- Validate GitHub owner/repo against regex before use
- Use SDK methods (gitCheckout) over shell commands when available
- Sanitize inputs that must go to shell
- Validate session IDs as UUIDs

### Git Commits

See the **git-commit** skill for detailed guidelines. Quick rules:
- Imperative mood ("Add feature" not "Added feature")
- ≤50 character subject line
- Explain why, not how

## File Structure

```
cloudx.sh/
├── src/
│   └── index.ts          # Main worker code
├── Dockerfile            # Container image definition
├── wrangler.jsonc        # Cloudflare configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── CLAUDE.md             # This file
└── .claude/
    └── skills/           # Project-specific skills
```

## Troubleshooting

### Container Issues

- **"Container is not enabled"**: Check wrangler.jsonc containers config matches durable_objects binding
- **"IMAGE_REGISTRY_NOT_CONFIGURED"**: Use `./Dockerfile` not external registry URLs

### Deployment Issues

- Ensure Docker is running for local dev
- First container deploy may take 2-3 minutes
- Check Cloudflare dashboard for worker logs

### Session Issues

- Sessions expire after 2 hours (KV TTL)
- Check `info:{sessionId}` in KV for status
- Error status includes error message in metadata
