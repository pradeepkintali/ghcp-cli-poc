# GitHub Copilot Wrapper Service - Azure Container App Deployment with Key Vault
# This script deploys the service using Azure Key Vault for secure credential management

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "copilot-wrapper-rg",

    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus",

    [Parameter(Mandatory=$false)]
    [string]$KeyVaultName = "",

    [Parameter(Mandatory=$false)]
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Copilot Wrapper - Azure Deployment (Secure)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$ACR_NAME = "copilotacr$(Get-Date -Format 'yyyyMMddHHmmss')"
$CONTAINER_APP_ENV = "copilot-env"
$CONTAINER_APP_NAME = "copilot-wrapper"
$IMAGE_NAME = "copilot-wrapper-service"
$IMAGE_TAG = "latest"

# Step 1: Check Azure login
Write-Host "[1/11] Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show 2>$null | ConvertFrom-Json
    if (-not $account) {
        throw "Not logged in"
    }
    Write-Host "Using subscription: $($account.name)" -ForegroundColor Green
} catch {
    Write-Host "Please log in to Azure..." -ForegroundColor Yellow
    az login
    $account = az account show | ConvertFrom-Json
}
Write-Host ""

# Step 2: Check for existing Key Vault or create new one
Write-Host "[2/11] Setting up Key Vault for secrets..." -ForegroundColor Yellow

if (-not $KeyVaultName) {
    # Check if config file exists
    if (Test-Path "config/azure-secrets.env") {
        Write-Host "Found existing Key Vault configuration" -ForegroundColor Green
        $configContent = Get-Content "config/azure-secrets.env" -Raw
        if ($configContent -match 'KEY_VAULT_NAME=([^\r\n]+)') {
            $KeyVaultName = $Matches[1]
            Write-Host "Using Key Vault: $KeyVaultName" -ForegroundColor Green
        }
    }
}

if (-not $KeyVaultName) {
    $KeyVaultName = "copilot-kv-$(Get-Random -Minimum 1000 -Maximum 9999)"
    Write-Host "Creating new Key Vault: $KeyVaultName" -ForegroundColor Yellow

    if (-not $GitHubToken) {
        # Check if .env file exists and read GitHub token from it
        if (Test-Path ".env") {
            Write-Host "Found .env file, checking for GitHub token..." -ForegroundColor Yellow
            $envContent = Get-Content ".env" -Raw
            if ($envContent -match 'GITHUB_TOKEN=([^\r\n]+)') {
                $GitHubToken = $Matches[1].Trim()
                if ($GitHubToken -and $GitHubToken -ne "") {
                    Write-Host "GitHub token found in .env file" -ForegroundColor Green
                }
            }
        }

        # If still no token, prompt the user
        if (-not $GitHubToken -or $GitHubToken -eq "") {
            Write-Host ""
            Write-Host "GitHub Personal Access Token is required for first-time setup" -ForegroundColor Red
            Write-Host "Create one at: https://github.com/settings/tokens" -ForegroundColor Yellow
            Write-Host "Required scopes: repo, read:org, copilot" -ForegroundColor Yellow
            Write-Host ""
            $GitHubToken = Read-Host "Enter your GitHub Personal Access Token" -AsSecureString
            $GitHubToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GitHubToken)
            )
        }
    }

    # Create resource group if needed
    $rgExists = az group exists --name $ResourceGroup
    if ($rgExists -eq "false") {
        az group create --name $ResourceGroup --location $Location --output table
    }

    # Create Key Vault
    az keyvault create `
        --name $KeyVaultName `
        --resource-group $ResourceGroup `
        --location $Location `
        --enable-rbac-authorization false `
        --output table

    # Store GitHub token
    az keyvault secret set `
        --vault-name $KeyVaultName `
        --name "github-token" `
        --value $GitHubToken `
        --output none

    Write-Host "Key Vault created and GitHub token stored" -ForegroundColor Green
} else {
    # Key Vault exists, check if GitHub token secret exists
    Write-Host "Using existing Key Vault: $KeyVaultName" -ForegroundColor Green
    $secretExists = az keyvault secret show --vault-name $KeyVaultName --name "github-token" 2>$null

    if (-not $secretExists) {
        Write-Host "GitHub token not found in Key Vault, adding it..." -ForegroundColor Yellow

        if (-not $GitHubToken) {
            # Check if .env file exists and read GitHub token from it
            if (Test-Path ".env") {
                Write-Host "Found .env file, checking for GitHub token..." -ForegroundColor Yellow
                $envContent = Get-Content ".env" -Raw
                if ($envContent -match 'GITHUB_TOKEN=([^\r\n]+)') {
                    $GitHubToken = $Matches[1].Trim()
                    if ($GitHubToken -and $GitHubToken -ne "") {
                        Write-Host "GitHub token found in .env file" -ForegroundColor Green
                    }
                }
            }

            # If still no token, prompt the user
            if (-not $GitHubToken -or $GitHubToken -eq "") {
                Write-Host ""
                Write-Host "GitHub Personal Access Token is required" -ForegroundColor Red
                Write-Host "Create one at: https://github.com/settings/tokens" -ForegroundColor Yellow
                Write-Host "Required scopes: repo, read:org, copilot" -ForegroundColor Yellow
                Write-Host ""
                $GitHubToken = Read-Host "Enter your GitHub Personal Access Token" -AsSecureString
                $GitHubToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GitHubToken)
                )
            }
        }

        # Store GitHub token in Key Vault
        az keyvault secret set `
            --vault-name $KeyVaultName `
            --name "github-token" `
            --value $GitHubToken `
            --output none

        Write-Host "GitHub token stored in Key Vault" -ForegroundColor Green
    } else {
        Write-Host "GitHub token already exists in Key Vault" -ForegroundColor Green
    }
}
Write-Host ""

# Step 3: Create Resource Group
Write-Host "[3/11] Ensuring resource group exists: $ResourceGroup" -ForegroundColor Yellow
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    az group create `
        --name $ResourceGroup `
        --location $Location `
        --output table
}
Write-Host ""

# Step 4: Create Azure Container Registry
Write-Host "[4/11] Creating Azure Container Registry: $ACR_NAME" -ForegroundColor Yellow
az acr create `
    --resource-group $ResourceGroup `
    --name $ACR_NAME `
    --sku Basic `
    --admin-enabled true `
    --output table
Write-Host ""

# Step 5: Get ACR credentials
Write-Host "[5/11] Retrieving ACR credentials..." -ForegroundColor Yellow
$ACR_USERNAME = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASSWORD = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv
$ACR_LOGIN_SERVER = az acr show --name $ACR_NAME --query loginServer -o tsv
Write-Host "ACR Login Server: $ACR_LOGIN_SERVER" -ForegroundColor Green
Write-Host ""

# Step 6: Build and push Docker image
Write-Host "[6/11] Building and pushing Docker image to ACR..." -ForegroundColor Yellow
az acr build `
    --registry $ACR_NAME `
    --image "${IMAGE_NAME}:${IMAGE_TAG}" `
    --file Dockerfile `
    .
Write-Host ""

# Step 7: Create Container App Environment
Write-Host "[7/11] Creating Container App Environment: $CONTAINER_APP_ENV" -ForegroundColor Yellow
az containerapp env create `
    --name $CONTAINER_APP_ENV `
    --resource-group $ResourceGroup `
    --location $Location `
    --output table
Write-Host ""

# Step 8: Create managed identity for the container app
Write-Host "[8/11] Creating managed identity..." -ForegroundColor Yellow
$identityName = "${CONTAINER_APP_NAME}-identity"
$identity = az identity create `
    --name $identityName `
    --resource-group $ResourceGroup `
    --location $Location `
    --output json | ConvertFrom-Json

$identityId = $identity.id
$identityPrincipalId = $identity.principalId
Write-Host "Managed identity created: $identityName" -ForegroundColor Green
Write-Host ""

# Step 9: Grant Key Vault access to managed identity
Write-Host "[9/11] Granting Key Vault access to managed identity..." -ForegroundColor Yellow
Start-Sleep -Seconds 10  # Wait for identity propagation

az keyvault set-policy `
    --name $KeyVaultName `
    --object-id $identityPrincipalId `
    --secret-permissions get list `
    --output table

Write-Host "Key Vault access granted" -ForegroundColor Green
Write-Host ""

# Step 10: Get secret reference URI
Write-Host "[10/11] Getting Key Vault secret reference..." -ForegroundColor Yellow
$vaultUri = az keyvault show --name $KeyVaultName --query properties.vaultUri -o tsv
$secretReference = "${vaultUri}secrets/github-token"
Write-Host "Secret reference: $secretReference" -ForegroundColor Green
Write-Host ""

# Step 11: Create Container App with Key Vault reference
Write-Host "[11/11] Creating Container App: $CONTAINER_APP_NAME" -ForegroundColor Yellow
az containerapp create `
    --name $CONTAINER_APP_NAME `
    --resource-group $ResourceGroup `
    --environment $CONTAINER_APP_ENV `
    --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" `
    --registry-server $ACR_LOGIN_SERVER `
    --registry-username $ACR_USERNAME `
    --registry-password $ACR_PASSWORD `
    --user-assigned $identityId `
    --target-port 3000 `
    --ingress external `
    --min-replicas 1 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --secrets "github-token-secret=keyvaultref:${secretReference},identityref:${identityId}" `
    --env-vars "GITHUB_TOKEN=secretref:github-token-secret" "NODE_ENV=production" "PORT=3000" `
    --output table

Write-Host ""

# Step 12: Get application URL
Write-Host "[12/12] Retrieving application URL..." -ForegroundColor Yellow
$APP_URL = az containerapp show `
    --name $CONTAINER_APP_NAME `
    --resource-group $ResourceGroup `
    --query properties.configuration.ingress.fqdn `
    -o tsv

Write-Host ""

# Display deployment summary
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Cyan
Write-Host "Container Registry: $ACR_NAME" -ForegroundColor Cyan
Write-Host "Key Vault: $KeyVaultName" -ForegroundColor Cyan
Write-Host "Container App: $CONTAINER_APP_NAME" -ForegroundColor Cyan
Write-Host "Application URL: https://$APP_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Security Features:" -ForegroundColor Yellow
Write-Host "[OK] GitHub credentials stored in Azure Key Vault" -ForegroundColor Green
Write-Host "[OK] Managed identity for secure access" -ForegroundColor Green
Write-Host "[OK] No hardcoded secrets in container" -ForegroundColor Green
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $ResourceGroup --follow" -ForegroundColor White
Write-Host ""
Write-Host "To update GitHub token:" -ForegroundColor Yellow
Write-Host "  az keyvault secret set --vault-name $KeyVaultName --name github-token --value 'new_token'" -ForegroundColor White
Write-Host "  az containerapp revision restart --name $CONTAINER_APP_NAME --resource-group $ResourceGroup" -ForegroundColor White
Write-Host ""
Write-Host "To delete all resources:" -ForegroundColor Yellow
Write-Host "  az group delete --name $ResourceGroup --yes --no-wait" -ForegroundColor White
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

# Save deployment info using array of strings instead of heredoc
$deploymentInfo = @(
    "Deployment Information (Secure Configuration)",
    "==============================================",
    "Resource Group: $ResourceGroup",
    "Location: $Location",
    "Container Registry: $ACR_NAME",
    "ACR Login Server: $ACR_LOGIN_SERVER",
    "Key Vault: $KeyVaultName",
    "Managed Identity: $identityName",
    "Container App Environment: $CONTAINER_APP_ENV",
    "Container App Name: $CONTAINER_APP_NAME",
    "Application URL: https://$APP_URL",
    "",
    "Security Configuration:",
    "  GitHub Token: Stored in Azure Key Vault (not in container)",
    "  Access Method: Managed Identity with Key Vault policy",
    "  Secret Reference: $secretReference",
    "",
    "Deployed: $(Get-Date)"
)

$deploymentInfo | Out-File -FilePath "deployment-info-secure.txt" -Encoding UTF8

Write-Host "Deployment information saved to: deployment-info-secure.txt" -ForegroundColor Green

