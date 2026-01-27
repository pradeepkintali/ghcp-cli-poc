# Universal Runner Script - Works with .env files locally and in cloud
# Reads GitHub credentials from .env file and runs the Docker container

param(
    [Parameter(Mandatory=$false)]
    [string]$EnvFile = ".env",

    [Parameter(Mandatory=$false)]
    [int]$Port = 3000,

    [Parameter(Mandatory=$false)]
    [switch]$Detached
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Copilot Wrapper - Universal Runner" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Add Docker to PATH if needed
$dockerPath = "C:\Program Files\Docker\Docker\resources\bin"
if (Test-Path $dockerPath) {
    $env:Path = "$dockerPath;" + $env:Path
}

# Check if .env file exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: .env file not found at: $EnvFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "To create one:" -ForegroundColor Yellow
    Write-Host "  1. Copy the template: cp config/secrets.template.env .env" -ForegroundColor White
    Write-Host "  2. Edit .env and add your GitHub token" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "Loading environment from: $EnvFile" -ForegroundColor Yellow

# Parse .env file and extract variables
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    # Skip comments and empty lines
    if ($line -and -not $line.StartsWith('#')) {
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            # Remove quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            $envVars[$key] = $value
        }
    }
}

# Validate required variables
if (-not $envVars.ContainsKey('GITHUB_TOKEN') -or [string]::IsNullOrWhiteSpace($envVars['GITHUB_TOKEN'])) {
    Write-Host "ERROR: GITHUB_TOKEN not found in $EnvFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please add your GitHub token to $EnvFile" -ForegroundColor Yellow
    Write-Host "Get a token at: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Validate token format
$token = $envVars['GITHUB_TOKEN']
if ($token -eq 'ghp_your_token_here' -or $token.Length -lt 20) {
    Write-Host "ERROR: GitHub token appears to be invalid or a placeholder" -ForegroundColor Red
    Write-Host ""
    Write-Host "Token value: $($token.Substring(0, [Math]::Min(20, $token.Length)))..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please update $EnvFile with a valid GitHub token" -ForegroundColor Yellow
    Write-Host "Get a token at: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "✓ GitHub token found: $($token.Substring(0, 10))..." -ForegroundColor Green

# Override port if specified in .env
if ($envVars.ContainsKey('PORT')) {
    $Port = [int]$envVars['PORT']
}

Write-Host "✓ Port: $Port" -ForegroundColor Green
Write-Host ""

# Check if Docker is available
try {
    $null = docker --version 2>$null
} catch {
    Write-Host "ERROR: Docker is not running or not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure Docker Desktop is running" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check if image exists
$imageExists = docker images -q copilot-wrapper-service 2>$null
if (-not $imageExists) {
    Write-Host "Docker image not found. Building..." -ForegroundColor Yellow
    Write-Host ""
    & .\docker-build.ps1
    Write-Host ""
}

# Stop any existing container with the same name
$existingContainer = docker ps -aq -f name=copilot-wrapper 2>$null
if ($existingContainer) {
    Write-Host "Stopping existing container..." -ForegroundColor Yellow
    docker stop copilot-wrapper 2>$null | Out-Null
    docker rm copilot-wrapper 2>$null | Out-Null
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Starting Container" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Port: $Port" -ForegroundColor White
Write-Host "  GitHub Token: $($token.Substring(0, 10))..." -ForegroundColor White
if ($envVars.ContainsKey('NODE_ENV')) {
    Write-Host "  Environment: $($envVars['NODE_ENV'])" -ForegroundColor White
} else {
    Write-Host "  Environment: production" -ForegroundColor White
}
Write-Host ""
Write-Host "Application URL: http://localhost:$Port" -ForegroundColor Green
Write-Host ""

if ($Detached) {
    Write-Host "Running in detached mode..." -ForegroundColor Yellow
    Write-Host "Use 'docker logs -f copilot-wrapper' to view logs" -ForegroundColor Gray
    Write-Host ""
}

# Build docker run command
$dockerArgs = @(
    'run'
)

if ($Detached) {
    $dockerArgs += '-d'
} else {
    $dockerArgs += '--rm'
}

$dockerArgs += '-p'
$dockerArgs += "${Port}:3000"
$dockerArgs += '--name'
$dockerArgs += 'copilot-wrapper'

# Add environment variables from .env
foreach ($key in $envVars.Keys) {
    $dockerArgs += '-e'
    $dockerArgs += "${key}=$($envVars[$key])"
}

$dockerArgs += 'copilot-wrapper-service'

# Run container
Write-Host "Starting container..." -ForegroundColor Cyan
if ($Detached) {
    & docker $dockerArgs
    Write-Host ""
    Write-Host "Container started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Yellow
    Write-Host "  View logs:  docker logs -f copilot-wrapper" -ForegroundColor White
    Write-Host "  Stop:       docker stop copilot-wrapper" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    & docker $dockerArgs
}
