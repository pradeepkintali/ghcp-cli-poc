# GitHub Copilot Wrapper Service

A containerized web service that provides a chat interface to GitHub Copilot using the Copilot SDK and CLI.

## Features

- **Web-based chat interface** for GitHub Copilot
- **SDK Chat Mode**: Natural language conversation with Copilot
- **CLI Command Mode**: Execute Copilot CLI commands (prefix with `/`)
- **Streaming and non-streaming** response modes
- **Dockerized** for easy deployment
- **Azure Container Apps** ready with Key Vault integration

## Prerequisites

- Node.js v22+ (required by Copilot CLI)
- Docker Desktop
- GitHub account with Copilot access
- GitHub Personal Access Token with `copilot` scope

## Quick Start

### 1. Setup Environment

Create a `.env` file from the template:

```bash
cp secrets.template.env .env
```

Edit `.env` and add your GitHub token:

```
GITHUB_TOKEN=github_pat_YOUR_TOKEN_HERE
PORT=3000
```

### 2. Run with Docker

```powershell
.\run-with-env.ps1
```

The service will be available at `http://localhost:3000`

### 3. Run Locally (without Docker)

```bash
npm install
npm start
```

## Usage

### Chat Mode (SDK)

Simply type your questions in the chat interface:

```
What is the difference between async and defer in JavaScript?
```

### CLI Command Mode

Prefix commands with `/` to execute Copilot CLI commands:

```
/agents
/explain this code
/help
```

### Streaming Toggle

- **ON**: Real-time streaming responses (may have timeout issues)
- **OFF**: Complete response after processing (more reliable)

## Project Structure

```
copilot-project/
├── src/
│   ├── server.js           # Express API server
│   └── copilot-service.js  # Copilot SDK wrapper
├── public/
│   ├── index.html          # Web UI
│   ├── app.js              # Frontend logic
│   └── styles.css          # UI styling
├── Dockerfile              # Container definition
├── docker-entrypoint.sh    # Container startup script
├── run-with-env.ps1        # Local runner with .env support
└── deploy-azure-with-secrets.ps1  # Azure deployment
```

## API Endpoints

### POST /api/chat
Non-streaming chat endpoint

**Request:**
```json
{
  "prompt": "Your question here",
  "model": "gpt-4.1"
}
```

**Response:**
```json
{
  "response": "Copilot's answer"
}
```

### POST /api/chat/stream
Streaming chat endpoint (Server-Sent Events)

Same request format, returns SSE stream with chunks.

## Deployment

### Azure Container Apps with Key Vault

```powershell
.\deploy-azure-with-secrets.ps1
```

This script:
- Creates Azure Container Registry
- Stores GitHub token in Key Vault
- Deploys container with managed identity
- Configures secure token access

### Manual Docker Deployment

```bash
docker build -t copilot-wrapper .
docker run -p 3000:3000 -e GITHUB_TOKEN=your_token copilot-wrapper
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub PAT with copilot scope | Required |
| `GH_TOKEN` | Alternative for GitHub token | Uses GITHUB_TOKEN |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | production |

## Troubleshooting

### Container exits immediately
- Check GitHub token is valid: `gh auth status`
- Verify token has `copilot` scope
- Review logs: `docker logs <container_id>`

### "Copilot CLI not found"
- Ensure using Node.js v22+ (not v18)
- Use Debian-based image (not Alpine)
- Verify installation: `which copilot`

### CLI commands not working
- Prefix commands with `/` (e.g., `/agents`)
- Ensure using non-streaming mode for best results
- Check token has required permissions

### Streaming disconnects
- This is a known issue with browser timeouts during SDK initialization
- **Solution**: Use non-streaming mode (toggle off)
- Pre-initialization on startup helps but may not eliminate all cases

### Authentication warnings
- Set both `GITHUB_TOKEN` and `GH_TOKEN` environment variables
- Use `export GH_TOKEN="$GITHUB_TOKEN"` in scripts
- Verify: `gh auth status`

## Technical Details

- **Copilot SDK**: @github/copilot v0.1.18
- **Copilot CLI**: v0.0.395
- **Node.js**: v22 (required minimum)
- **Base Image**: node:22-slim (Debian-based for glibc)
- **Frontend**: Vanilla JavaScript with SSE support
- **Backend**: Express.js with CORS enabled

## Security Notes

- Never commit `.env` file (already in `.gitignore`)
- Use Azure Key Vault for production deployments
- Rotate GitHub tokens regularly
- Review token scopes and minimize permissions

## License

MIT
