# cloudx.sh

Launch any GitHub repository as an AI-powered development environment instantly using Cloudflare Sandbox and OpenCode with Claude Opus 4.5.

![cloudx.sh home page](https://github.com/user-attachments/assets/672ca93d-9dfd-438c-b7d2-67b5b15b694e)

## Features

- **Instant Environments**: Visit `https://cloudx.sh/github.com/owner/repo` to launch any public repository
- **Claude Opus 4.5**: Powered by Anthropic's most capable model for intelligent code assistance
- **OpenCode Integration**: Full-featured AI development environment with terminal, editor, and chat
- **Live Preview**: Get a public URL to your running development environment instantly
- **Edge-Powered**: Built on Cloudflare's global network for fast, secure execution

## Quick Start

Just visit any URL in this format:

```
https://cloudx.sh/github.com/owner/repo
```

For example:
- `https://cloudx.sh/github.com/facebook/react`
- `https://cloudx.sh/github.com/vercel/next.js`
- `https://cloudx.sh/github.com/denoland/deno`

<details>
<summary>View Session Screenshot</summary>

![Session page showing repository status](https://github.com/user-attachments/assets/e42fa9b8-505b-444c-9b8d-eb90a0181128)

</details>

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

- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local development)
- [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages)
- [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/danielbodnar/cloudx.sh.git
cd cloudx.sh

# Install dependencies
bun install
# or: npm install

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

- **Public repos only**: GitHub authentication not yet implemented
- **Session timeout**: Sandbox sleeps after 30 minutes of inactivity
- **API key required**: Anthropic API key needed for Claude Opus 4.5

## Custom Domains

The service is available on multiple domains:

| Domain | Status |
|--------|--------|
| [cloudx.sh](https://cloudx.sh) | Primary |
| [vmspawn.sh](https://vmspawn.sh) | Active |
| [vmspawn.dev](https://vmspawn.dev) | Active |
| [nspawn.sh](https://nspawn.sh) | Active |
| [nspawn.dev](https://nspawn.dev) | Active |

## Troubleshooting

<details>
<summary>Common Issues</summary>

### Container Issues

- **"Container is not enabled"**: Verify `wrangler.jsonc` containers config matches the durable_objects binding
- **"IMAGE_REGISTRY_NOT_CONFIGURED"**: Use `./Dockerfile` path, not external registry URLs
- **Container timeout**: First container deploy may take 2-3 minutes to provision

### Session Issues

- **Session not found**: Sessions expire after 2 hours (KV TTL)
- **Status stuck on "initializing"**: Check worker logs in Cloudflare dashboard
- **OpenCode not loading**: Verify the Anthropic API key is set correctly

### Development Issues

- **Docker required**: Local development requires Docker Desktop running
- **Port conflicts**: Default port is 8787; change with `--port` flag

</details>

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/) - Secure container execution
- [OpenCode](https://opencode.ai) - AI-powered development environment
- [Anthropic Claude](https://www.anthropic.com/claude) - Advanced AI model
