# Configuration Directory

This directory contains configuration templates and scripts for managing secrets securely.

## Files

### secrets.template.env
Template showing required environment variables. Copy this to create your local `.env` file:

```powershell
# Copy template
cp config/secrets.template.env .env

# Edit with your values
notepad .env
```

**Never commit the actual `.env` file!**

### azure-secrets-setup.ps1
PowerShell script to create Azure Key Vault and store GitHub credentials securely.

**Usage:**
```powershell
.\config\azure-secrets-setup.ps1 -GitHubToken "ghp_your_token_here"
```

**What it does:**
1. Creates Azure Key Vault
2. Stores GitHub token as a secret
3. Generates `azure-secrets.env` with Key Vault information

### azure-secrets.env (Auto-generated)
Contains Key Vault configuration after running `azure-secrets-setup.ps1`.

**This file is gitignored!**

Example content:
```env
RESOURCE_GROUP=copilot-wrapper-rg
KEY_VAULT_NAME=copilot-kv-1234
SECRET_URI=https://copilot-kv-1234.vault.azure.net/secrets/github-token
LOCATION=eastus
```

## Configuration Approaches

### For Local Development

1. **Create local .env file:**
   ```powershell
   cp config/secrets.template.env .env
   ```

2. **Edit .env with your values:**
   ```env
   GITHUB_TOKEN=ghp_your_personal_token
   PORT=3000
   NODE_ENV=development
   ```

3. **Run locally:**
   ```powershell
   # Load .env and start
   npm start
   ```

### For Docker (Local)

**Option 1: Mount GitHub credentials**
```powershell
docker run --rm `
  -p 3000:3000 `
  -v "$env:USERPROFILE\.config\gh:/root/.config/gh:ro" `
  copilot-wrapper-service
```

**Option 2: Pass token as environment variable**
```powershell
docker run --rm `
  -p 3000:3000 `
  -e GITHUB_TOKEN=ghp_your_token `
  copilot-wrapper-service
```

**Option 3: Use .env file**
```powershell
docker run --rm `
  -p 3000:3000 `
  --env-file .env `
  copilot-wrapper-service
```

### For Azure Deployment

**Recommended: Use Azure Key Vault**

1. **Setup Key Vault:**
   ```powershell
   .\config\azure-secrets-setup.ps1 -GitHubToken "ghp_your_token"
   ```

2. **Deploy with secrets:**
   ```powershell
   .\deploy-azure-with-secrets.ps1
   ```

The deployment script will:
- Create Managed Identity for the Container App
- Grant Key Vault access to the identity
- Configure environment variables to reference Key Vault secrets
- **No secrets in container images or configuration files!**

## Security Best Practices

### ✅ DO:
- Use Azure Key Vault for production deployments
- Rotate tokens regularly (every 90 days)
- Use Managed Identities for authentication
- Keep `.env` files in `.gitignore`
- Use minimum required token permissions

### ❌ DON'T:
- Commit `.env` files to git
- Hardcode tokens in source code
- Share tokens in chat or email
- Use the same token for dev and prod
- Grant excessive token permissions

## Token Permissions

### GitHub Personal Access Token

Create at: https://github.com/settings/tokens

**Required scopes for Copilot SDK:**
- `repo` - Full control of private repositories
- `read:org` - Read org and team membership
- `copilot` - Access to GitHub Copilot

**Optional (for enhanced features):**
- `read:user` - Read user profile data
- `gist` - Create gists

### Token Security

- Tokens are as powerful as your password
- Treat them like passwords
- Never commit to git
- Rotate regularly
- Revoke unused tokens at: https://github.com/settings/tokens

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | Yes* | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment (development/production) | No | production |
| `COPILOT_MODEL` | Default Copilot model | No | gpt-4.1 |

*Required unless using mounted GitHub CLI credentials

## Troubleshooting

### "GitHub token not found"

1. Check `.env` file exists and contains `GITHUB_TOKEN`
2. Verify token format: `ghp_...` (40 characters)
3. Test token:
   ```powershell
   curl -H "Authorization: token ghp_your_token" https://api.github.com/user
   ```

### "Permission denied"

- Token may have expired
- Token may lack required scopes
- Regenerate at: https://github.com/settings/tokens

### "Key Vault access denied" (Azure)

- Managed Identity may not have Key Vault access
- Run:
  ```powershell
  az keyvault set-policy `
    --name your-keyvault `
    --object-id <managed-identity-id> `
    --secret-permissions get list
  ```

## Quick Reference

| Task | Command |
|------|---------|
| Create local .env | `cp config/secrets.template.env .env` |
| Setup Azure Key Vault | `.\config\azure-secrets-setup.ps1 -GitHubToken "..."` |
| View Key Vault secret | `az keyvault secret show --vault-name ... --name github-token` |
| Update Key Vault secret | `az keyvault secret set --vault-name ... --name github-token --value "..."` |
| Create GitHub token | Visit https://github.com/settings/tokens |

## Support

For detailed Azure deployment instructions, see:
- [AZURE-SECRETS.md](../AZURE-SECRETS.md) - Complete Azure Key Vault guide
- [SETUP.md](../SETUP.md) - Local setup instructions
- [README.md](../README.md) - Main documentation
