# Docker Run Script
# Adds Docker to PATH and runs the container with GitHub credentials

$dockerPath = "C:\Program Files\Docker\Docker\resources\bin"
$env:Path = "$dockerPath;" + $env:Path

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Copilot Wrapper Service - Docker Run" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if GitHub config exists on host
$ghConfigPath = "$env:USERPROFILE\.config\gh"

if (Test-Path $ghConfigPath) {
    Write-Host "Found GitHub CLI configuration at: $ghConfigPath" -ForegroundColor Green
    Write-Host "Mounting GitHub credentials into container..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Starting container with GitHub authentication..." -ForegroundColor Cyan
    Write-Host "The application will be available at:" -ForegroundColor Yellow
    Write-Host "  http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the container" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""

    # Run with mounted GitHub credentials
    docker run --rm `
        -p 3000:3000 `
        -v "${ghConfigPath}:/root/.config/gh:ro" `
        --name copilot-wrapper `
        copilot-wrapper-service
} else {
    Write-Host "WARNING: GitHub CLI configuration not found!" -ForegroundColor Red
    Write-Host "Path checked: $ghConfigPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The container will start, but the Copilot SDK may not work without authentication." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix this:" -ForegroundColor Cyan
    Write-Host "1. Install GitHub CLI on your host machine:" -ForegroundColor White
    Write-Host "   winget install --id GitHub.cli" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Authenticate:" -ForegroundColor White
    Write-Host "   gh auth login" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Install Copilot extension:" -ForegroundColor White
    Write-Host "   gh extension install github/gh-copilot" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or run with a GITHUB_TOKEN environment variable:" -ForegroundColor White
    Write-Host "   docker run -e GITHUB_TOKEN=your_token -p 3000:3000 copilot-wrapper-service" -ForegroundColor Gray
    Write-Host ""

    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Exiting..." -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host "Starting container WITHOUT GitHub authentication..." -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""

    # Run without mounted credentials
    docker run --rm `
        -p 3000:3000 `
        --name copilot-wrapper `
        copilot-wrapper-service
}
