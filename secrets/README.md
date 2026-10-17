# Secrets Directory

This directory is for local development use only when provisioning secrets as files.

**Never commit secrets to this directory.** It is protected by `.gitignore`.

## For Production

Production uses environment variables, not files. See [DEPLOYMENT.md](../DEPLOYMENT.md) for setup instructions.

## For Local Development

If testing the production compose locally, place secrets as files here:

- `jwt_secret.txt` - JWT signing secret
- `server_private_key.txt` - Stellar account private key
- `payment_signing_secret.txt` - Payment request signing secret

Then update `docker-compose.prod.yml` to use Docker secrets (file mounts) instead of environment variables.
