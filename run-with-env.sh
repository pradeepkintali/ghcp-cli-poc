#!/bin/bash
# Universal Runner Script - Works with .env files locally and in cloud
# Reads GitHub credentials from .env file and runs the Docker container

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
ENV_FILE="${ENV_FILE:-.env}"
PORT="${PORT:-3000}"
DETACHED=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --detached|-d)
            DETACHED=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}Copilot Wrapper - Universal Runner${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}ERROR: .env file not found at: $ENV_FILE${NC}"
    echo ""
    echo -e "${YELLOW}To create one:${NC}"
    echo "  1. Copy the template: cp config/secrets.template.env .env"
    echo "  2. Edit .env and add your GitHub token"
    echo ""
    exit 1
fi

echo -e "${YELLOW}Loading environment from: $ENV_FILE${NC}"

# Load .env file
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# Validate GITHUB_TOKEN
if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "ghp_your_token_here" ]; then
    echo -e "${RED}ERROR: GITHUB_TOKEN not found or is a placeholder${NC}"
    echo ""
    echo -e "${YELLOW}Please update $ENV_FILE with a valid GitHub token${NC}"
    echo "Get a token at: https://github.com/settings/tokens"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ GitHub token found: ${GITHUB_TOKEN:0:10}...${NC}"
echo -e "${GREEN}✓ Port: $PORT${NC}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker is not installed${NC}"
    echo ""
    echo -e "${YELLOW}Please install Docker first${NC}"
    echo ""
    exit 1
fi

# Check if image exists
if ! docker images -q copilot-wrapper-service &> /dev/null | grep -q .; then
    echo -e "${YELLOW}Docker image not found. Building...${NC}"
    echo ""
    docker build -t copilot-wrapper-service .
    echo ""
fi

# Stop any existing container
if docker ps -aq -f name=copilot-wrapper &> /dev/null | grep -q .; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop copilot-wrapper &> /dev/null || true
    docker rm copilot-wrapper &> /dev/null || true
fi

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}Starting Container${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Port: $PORT"
echo "  GitHub Token: ${GITHUB_TOKEN:0:10}..."
echo "  Environment: ${NODE_ENV:-production}"
echo ""
echo -e "${GREEN}Application URL: http://localhost:$PORT${NC}"
echo ""

# Build docker run command
DOCKER_ARGS=(
    run
    -p "$PORT:3000"
    --name copilot-wrapper
    -e "GITHUB_TOKEN=$GITHUB_TOKEN"
    -e "NODE_ENV=${NODE_ENV:-production}"
    -e "PORT=3000"
)

if [ "$DETACHED" = true ]; then
    DOCKER_ARGS+=(-d)
    echo -e "${YELLOW}Running in detached mode...${NC}"
    echo -e "${NC}Use 'docker logs -f copilot-wrapper' to view logs${NC}"
    echo ""
else
    DOCKER_ARGS+=(--rm)
fi

# Add Copilot model if set
if [ -n "$COPILOT_MODEL" ]; then
    DOCKER_ARGS+=(-e "COPILOT_MODEL=$COPILOT_MODEL")
fi

DOCKER_ARGS+=(copilot-wrapper-service)

# Run container
echo -e "${CYAN}Starting container...${NC}"
if [ "$DETACHED" = true ]; then
    docker "${DOCKER_ARGS[@]}"
    echo ""
    echo -e "${GREEN}✓ Container started successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  View logs:  docker logs -f copilot-wrapper"
    echo "  Stop:       docker stop copilot-wrapper"
    echo ""
else
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo -e "${CYAN}==========================================${NC}"
    echo ""
    docker "${DOCKER_ARGS[@]}"
fi
