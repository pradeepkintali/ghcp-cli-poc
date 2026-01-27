#!/bin/bash
set -e

echo "==================================="
echo "Copilot Wrapper Service Starting..."
echo "==================================="

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo "ERROR: GitHub CLI is not installed"
    exit 1
fi

echo "GitHub CLI version: $(gh --version | head -1)"

# Check for GitHub authentication
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Setting up GitHub authentication..."

    # Export GH_TOKEN for GitHub CLI to use
    export GH_TOKEN="$GITHUB_TOKEN"

    # Verify authentication works
    if gh auth status >/dev/null 2>&1; then
        echo "✓ GitHub authentication successful!"
        echo "  Authenticated as: $(gh api user -q .login 2>/dev/null || echo 'authenticated user')"
    else
        echo "⚠ GitHub authentication configured, but verification failed"
        echo "  The Copilot SDK will still attempt to use the token"
    fi
elif [ -f "/root/.config/gh/hosts.yml" ]; then
    echo "Using mounted GitHub credentials..."
    if gh auth status 2>&1; then
        echo "✓ GitHub authentication verified"
    else
        echo "⚠ Warning: Mounted credentials may not be valid"
    fi
else
    echo "WARNING: No GitHub authentication found"
    echo "The Copilot SDK requires GitHub authentication to work."
    echo ""
    echo "To fix this, run the container with:"
    echo "  docker run -v \"\$HOME/.config/gh:/root/.config/gh:ro\" -p 3000:3000 copilot-wrapper-service"
    echo "Or set GITHUB_TOKEN environment variable:"
    echo "  docker run -e GITHUB_TOKEN=\$GITHUB_TOKEN -p 3000:3000 copilot-wrapper-service"
    echo ""
fi

# Check for npm Copilot CLI (required by SDK)
echo "Checking for Copilot CLI (npm package)..."
if command -v copilot &> /dev/null; then
    echo "✓ Copilot CLI found at: $(which copilot)"
    if copilot --version 2>&1; then
        echo "✓ Copilot CLI version verified"
    fi
else
    echo "ERROR: Copilot CLI (npm package) not found"
    echo "The Copilot SDK requires @github/copilot to be installed globally"
    exit 1
fi

# Also try to install gh Copilot extension (optional, for manual testing)
echo "Checking for gh Copilot extension (optional)..."
if ! gh extension list 2>/dev/null | grep -q "gh-copilot"; then
    echo "Installing gh Copilot extension for manual testing..."
    if gh extension install github/gh-copilot 2>&1; then
        echo "✓ gh Copilot extension installed"
    else
        echo "⚠ Could not install gh Copilot extension (non-critical)"
    fi
else
    echo "✓ gh Copilot extension already installed"
fi

echo "==================================="
echo "Starting application on port ${PORT:-3000}..."
echo "==================================="
echo ""

# Start the Node.js application
exec node src/server.js
