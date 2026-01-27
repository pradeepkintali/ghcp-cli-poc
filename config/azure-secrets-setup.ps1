# Azure Key Vault Setup for GitHub Credentials
# This script creates an Azure Key Vault and stores GitHub credentials securely

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "copilot-wrapper-rg",

    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus",

    [Parameter(Mandatory=$false)]
    [string]$KeyVaultName = "copilot-kv-$(Get-Random -Minimum 1000 -Maximum 9999)",

    [Parameter(Mandatory=$true)]
    [string]$GitHubToken
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Azure Key Vault Setup for GitHub Secrets" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if logged in to Azure
Write-Host "[1/6] Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show 2>$null | ConvertFrom-Json
    if (-not $account) {
        throw "Not logged in"
    }
    Write-Host "Using subscription: $($account.name)" -ForegroundColor Green
} catch {
    Write-Host "Please log in to Azure..." -ForegroundColor Yellow
    az login
}
Write-Host ""

# Create or get existing resource group
Write-Host "[2/6] Ensuring resource group exists..." -ForegroundColor Yellow
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Host "Creating resource group: $ResourceGroup" -ForegroundColor Yellow
    az group create --name $ResourceGroup --location $Location --output table
} else {
    Write-Host "Resource group already exists: $ResourceGroup" -ForegroundColor Green
}
Write-Host ""

# Create Key Vault
Write-Host "[3/6] Creating Azure Key Vault: $KeyVaultName" -ForegroundColor Yellow
try {
    az keyvault create `
        --name $KeyVaultName `
        --resource-group $ResourceGroup `
        --location $Location `
        --enable-rbac-authorization false `
        --output table
    Write-Host "Key Vault created successfully" -ForegroundColor Green
} catch {
    Write-Host "Error creating Key Vault. It may already exist or name may be taken." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Store GitHub Token in Key Vault
Write-Host "[4/6] Storing GitHub token in Key Vault..." -ForegroundColor Yellow
az keyvault secret set `
    --vault-name $KeyVaultName `
    --name "github-token" `
    --value $GitHubToken `
    --output table
Write-Host "GitHub token stored successfully" -ForegroundColor Green
Write-Host ""

# Get the secret URI
Write-Host "[5/6] Retrieving secret URI..." -ForegroundColor Yellow
$secretUri = az keyvault secret show `
    --vault-name $KeyVaultName `
    --name "github-token" `
    --query "id" `
    --output tsv
Write-Host "Secret URI: $secretUri" -ForegroundColor Green
Write-Host ""

# Save configuration
Write-Host "[6/6] Saving configuration..." -ForegroundColor Yellow
$config = @"
# Azure Key Vault Configuration
# Generated on $(Get-Date)

RESOURCE_GROUP=$ResourceGroup
KEY_VAULT_NAME=$KeyVaultName
SECRET_URI=$secretUri
LOCATION=$Location

# To retrieve the secret:
# az keyvault secret show --vault-name $KeyVaultName --name github-token --query value -o tsv

# To update the secret:
# az keyvault secret set --vault-name $KeyVaultName --name github-token --value "new_token"

# To delete the Key Vault:
# az keyvault delete --name $KeyVaultName --resource-group $ResourceGroup
"@

$config | Out-File -FilePath "config/azure-secrets.env" -Encoding UTF8
Write-Host "Configuration saved to: config/azure-secrets.env" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Key Vault Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Key Vault Name: $KeyVaultName" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Cyan
Write-Host "Secret Name: github-token" -ForegroundColor Cyan
Write-Host "Secret URI: $secretUri" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Update deploy-azure.ps1 to use this Key Vault" -ForegroundColor White
Write-Host "2. Deploy your container app with: .\deploy-azure.ps1" -ForegroundColor White
Write-Host ""
Write-Host "The deployment script will automatically:" -ForegroundColor Yellow
Write-Host "- Grant the Container App access to Key Vault" -ForegroundColor White
Write-Host "- Configure environment variables to reference the secret" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
