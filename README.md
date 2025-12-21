# cloudx.sh

Launch any GitHub repository as an AI-powered development environment instantly using Cloudflare Sandbox and OpenCode with Claude Opus 4.5.

## Features

- **Instant Environments**: Visit `https://cloudx.sh/github.com/owner/repo` to launch any public repository
- **Claude Opus 4.5**: Powered by Anthropic's most capable model for intelligent code assistance
- **OpenCode Integration**: Full-featured AI development environment with terminal, editor, and chat
- **Live Preview**: Get a public URL to your running development environment instantly
- **Edge-Powered**: Built on Cloudflare's global network for fast, secure execution

## How It Works

1. **URL Interception**: Visit `/github.com/owner/repo` to trigger environment creation
2. **Repository Cloning**: The repo is cloned into a Cloudflare Sandbox container
3. **OpenCode Launch**: OpenCode server starts with Claude Opus 4.5 as the AI backend
4. **Live Access**: Get a URL to access the full OpenCode web IDE with your repository

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User Request  │────▶│  Cloudflare      │────▶│  Cloudflare     │
│   /github.com/  │     │  Worker          │     │  Sandbox        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                 ┌─────────────────┐
                                                 │   OpenCode      │
                                                 │   + Claude 4.5  │
                                                 └─────────────────┘
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local development)
- [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages)
- [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/cloudx-sh.git
cd cloudx-sh

# Install dependencies
bun install

# Set up wrangler (Cloudflare CLI)
bunx wrangler login
```

### Configuration

1. Copy the environment template:
```bash
cp .dev.vars.example .dev.vars
```

2. Add your Anthropic API key to `.dev.vars`:
```
ANTHROPIC_API_KEY=your-api-key-here
```

3. Create a KV namespace:
```bash
bunx wrangler kv:namespace create CACHE
bunx wrangler kv:namespace create CACHE --preview
```

4. Update `wrangler.jsonc` with your KV namespace IDs

### Development

```bash
# Start local development server
bun run dev
```

Visit `http://localhost:8787/github.com/owner/repo` to test.

### Deployment

```bash
# Set the Anthropic API key as a secret
bunx wrangler secret put ANTHROPIC_API_KEY

# Deploy to Cloudflare
bun run deploy
```

Note: Container provisioning may take 2-3 minutes after initial deployment.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/github.com/:owner/:repo` | GET | Launch OpenCode environment for a repository |
| `/api/task` | POST | Execute a task using Claude Opus 4.5 |
| `/api/status/:sessionId` | GET | Get session status and preview URL |
| `/health` | GET | Health check |

### Execute Task API

```bash
curl -X POST https://cloudx.sh/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "task": "Add a new endpoint to handle user authentication"
  }'
```

## Project Structure

```
cloudx-sh/
├── src/
│   └── index.ts           # Main worker with OpenCode integration
├── Dockerfile             # Sandbox container with OpenCode CLI
├── wrangler.jsonc         # Cloudflare configuration
├── .dev.vars.example      # Environment template
├── package.json
└── tsconfig.json
```

## Container Image

The sandbox container includes:

- Cloudflare Sandbox base image
- OpenCode CLI (latest)
- Node.js + npm, pnpm, yarn, bun
- Python 3 + pip, poetry, uv
- TypeScript, tsx

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Opus 4.5 | Yes |
| `ENVIRONMENT` | Deployment environment | No |

## Limitations

- **Public repos only** (GitHub authentication not yet implemented)
- **Session timeout**: Sandbox sleeps after 30 minutes of inactivity
- **API key required**: Anthropic API key needed for Claude Opus 4.5

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/)
- [OpenCode](https://opencode.ai)
- [Anthropic Claude](https://www.anthropic.com/claude)
