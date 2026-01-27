# Use official Node.js runtime as base image
# Copilot CLI requires Node.js v22 or higher
# Using Debian-based image (not Alpine) because Copilot CLI binaries need glibc
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install GitHub CLI and dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    git \
    ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Install GitHub Copilot CLI (npm package required by SDK)
RUN npm install -g @github/copilot

# Copy application files
COPY src/ ./src/
COPY public/ ./public/

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create directory for GitHub CLI config
RUN mkdir -p /root/.config/gh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]
