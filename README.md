# cloudx.sh

Launch any GitHub repository as a development environment instantly using Cloudflare Sandbox and Workers AI.

## Features

- **Instant Environments**: Visit `https://cloudx.sh/github.com/owner/repo` to launch any public repository
- **AI-Powered Detection**: Uses Workers AI to automatically detect project type and configuration
- **Multi-Runtime Support**: Node.js, Python, Rust, Go, Ruby, PHP, and more
- **Live Preview**: Get a public URL to your running application instantly
- **Edge-Powered**: Built on Cloudflare's global network for fast, secure execution

## How It Works

1. **URL Interception**: When you visit `/github.com/owner/repo`, the worker intercepts the request
2. **Repository Cloning**: The repo is cloned into a Cloudflare Sandbox container
3. **AI Analysis**: Workers AI analyzes the repository structure to determine:
   - Project type (Node.js, Python, etc.)
   - Package manager (npm, yarn, pnpm, bun, pip, cargo, etc.)
   - Build and start commands
   - Default port
4. **Environment Setup**: Dependencies are installed and the project is built
5. **Application Launch**: The application is started and a preview URL is generated

## Supported Project Types

| Type | Detection | Package Managers |
|------|-----------|------------------|
| Node.js | `package.json` | npm, yarn, pnpm, bun |
| Python | `requirements.txt`, `pyproject.toml` | pip, poetry, pdm, uv |
| Rust | `Cargo.toml` | cargo |
| Go | `go.mod` | go mod |
| Ruby | `Gemfile` | bundler |
| PHP | `composer.json` | composer |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User Request  │────▶│  Cloudflare      │────▶│  Cloudflare     │
│                 │     │  Worker          │     │  Sandbox        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  Workers AI      │     │  Container      │
                        │  (Analysis)      │     │  (Execution)    │
                        └──────────────────┘     └─────────────────┘
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local development)
- [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/cloudx-sh.git
cd cloudx-sh

# Install dependencies
npm install

# Set up wrangler (Cloudflare CLI)
npx wrangler login
```

### Configuration

1. Create a KV namespace:
```bash
npx wrangler kv:namespace create CACHE
npx wrangler kv:namespace create CACHE --preview
```

2. Update `wrangler.jsonc` with your KV namespace IDs

3. (Optional) Set GitHub token for private repos:
```bash
npx wrangler secret put GITHUB_TOKEN
```

### Development

```bash
# Start local development server
npm run dev
```

Visit `http://localhost:8787/github.com/owner/repo` to test.

### Deployment

```bash
# Deploy to Cloudflare
npm run deploy
```

Note: Container provisioning may take 2-3 minutes after initial deployment.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/github.com/:owner/:repo` | GET | Launch a repository environment |
| `/session/:sessionId` | GET | View session status page |
| `/api/status/:sessionId` | GET | Get session status JSON |
| `/api/logs/:sessionId` | GET | Get session logs |
| `/api/exec/:sessionId` | POST | Execute command in session |
| `/api/stop/:sessionId` | POST | Stop a session |
| `/api/analyze/:owner/:repo` | GET | Analyze repo without launching |
| `/health` | GET | Health check |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Deployment environment | `production` |
| `MAX_SESSION_LIFETIME_MINUTES` | Maximum session duration | `60` |
| `GITHUB_API_BASE` | GitHub API base URL | `https://api.github.com` |

## Secrets

| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | GitHub API token for private repos |

## Project Structure

```
cloudx-sh/
├── src/
│   ├── index.ts           # Main worker entry point
│   ├── types/             # TypeScript type definitions
│   ├── services/
│   │   ├── github.ts      # GitHub API service
│   │   ├── ai-analyzer.ts # Workers AI analysis
│   │   └── session-handler.ts # Session management
│   └── ui/
│       └── pages.tsx      # Server-rendered UI pages
├── Dockerfile             # Sandbox container image
├── wrangler.jsonc         # Cloudflare configuration
├── package.json
└── tsconfig.json
```

## Container Image

The sandbox container includes:

- Node.js 22 LTS + npm, yarn, pnpm, bun
- Python 3.12 + pip, poetry, pdm, uv
- Rust (latest stable)
- Go 1.22
- Ruby + bundler
- PHP + composer
- Common development tools (git, vim, curl, etc.)

## Limitations

- **Public repos only** (without GITHUB_TOKEN)
- **Session timeout**: 60 minutes by default
- **Container resources**: Varies by Sandbox instance type
- **Large repositories**: May take longer to clone/build

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Hono](https://hono.dev/) - Lightweight web framework
