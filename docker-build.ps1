# Docker Build Script
# Adds Docker to PATH and builds the container

$dockerPath = "C:\Program Files\Docker\Docker\resources\bin"
$env:Path = "$dockerPath;" + $env:Path

Write-Host "Building copilot-wrapper-service Docker image..." -ForegroundColor Cyan
Write-Host ""

docker build -t copilot-wrapper-service .

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To run the container:" -ForegroundColor Yellow
    Write-Host "  docker run -p 3000:3000 copilot-wrapper-service" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the run script:" -ForegroundColor Yellow
    Write-Host "  .\docker-run.ps1" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "Build failed. Make sure Docker Desktop is running." -ForegroundColor Red
}
