# VeraTrace Enterprise Forensic Engine — Production Deployment Guide

## 1. Hosting Architecture & Storage Invariants

VeraTrace is an immutable evidence preservation and cross-platform intelligence platform. Its design relies on strict physical invariants:
1. **SQLite Database (`server/data/veratrace.db`)**: Operates in WAL mode (`journal_mode = WAL`) with busy timeout handling.
2. **Encrypted Evidence Vault (`server/vault_storage/`)**: Stores binary files encrypted with AES-256-GCM.
3. **Cryptographic Keyfiles (`server/data/`)**: Stores the master vault key (`.vault_master.key`), the custody Ed25519 signing keypair (`.custody_ed25519.key`), and authentication secret (`.auth_master.key`).

### Critical Persistent Storage Requirement
> [!IMPORTANT]
> **Ephemeral storage hosting is strictly prohibited.**
> Serverless platforms (e.g. standard AWS Lambda, Vercel Serverless Functions, Heroku standard dynos) wipe the local filesystem on container recycling. If deployed to ephemeral storage, vault master keys and evidence files will be permanently lost upon redeployment or cold start.

### Recommended Production Topologies
* **Dedicated Linux VPS / Cloud VM (Recommended)**: DigitalOcean Droplet, AWS EC2, GCP Compute Engine, or Hetzner Cloud with attached persistent SSD volume.
* **Persistent Container Platforms**: Fly.io with persistent volumes (`[mounts] source="veratrace_data" destination="/app/server"`), AWS ECS with EFS volume mount, or Kubernetes StatefulSet with PersistentVolumeClaims (PVC).
* **Architectural Trade-offs (Local Filesystem vs. Cloud Object Storage)**:
  * *Local Persistent Block Storage (Current Architecture)*: Fastest ingestion, zero external egress fees, local POSIX / Windows NTFS DACL protection, zero network latency during forensic SHA-256 verification.
  * *Cloud Object Storage (AWS S3 / GCP GCS)*: Required for horizontally auto-scaled multi-node deployments. If migrating to S3, client-side envelope encryption (`server/vault.js`) must be retained so object storage providers never hold plaintext evidence.

---

## 2. Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Set to `production` in production. Rejects localhost CORS origins and enforces HTTPS cookie security flags. |
| `PORT` | Optional | `4000` | Port on which the Express REST API listens. |
| `ALLOWED_ORIGINS` | Recommended | `https://veratrace-app.vercel.app` | Comma-separated list of whitelisted web origins. Arbitrary origins or subdomains are rejected with HTTP 403. |
| `VERATRACE_VAULT_KEY` | Optional | Generated keyfile | Passphrase used to derive the 256-bit AES-GCM master vault key. If omitted, generated into `server/data/.vault_master.key`. |
| `VERATRACE_JWT_SECRET` | Optional | Generated keyfile | Secret used for HMAC-SHA256 session token signatures. If omitted, generated into `server/data/.auth_master.key`. |
| `MAX_FILE_SIZE_BYTES` | Optional | `104857600` (100MB) | File upload limit enforced at reverse proxy and Multer ingestion boundary. |

---

## 3. Server Startup & Service Management

### Prerequisites
* Node.js v20.x or v22.x LTS
* npm v9+

### Startup via Node.js
```bash
# 1. Install production dependencies
npm ci --omit=dev

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with production parameters

# 3. Start server
NODE_ENV=production node server/server.js
```

### Startup via Systemd (`/etc/systemd/system/veratrace.service`)
```ini
[Unit]
Description=VeraTrace Enterprise Forensic Engine
After=network.target

[Service]
Type=simple
User=veratrace
WorkingDirectory=/opt/veratrace
EnvironmentFile=/opt/veratrace/.env
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=veratrace

# Security Sandboxing
ProtectSystem=strict
ReadWritePaths=/opt/veratrace/server/data /opt/veratrace/server/vault_storage /opt/veratrace/server/backups
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

---

## 4. Disaster Recovery & Backup Management

### Creating Encrypted Backups
Backups are created via authenticated API call or scheduled administrative script:
```bash
curl -X POST http://localhost:4000/api/backup \
  -H "Authorization: Bearer <ADMIN_OR_USER_TOKEN>"
```
The server packages all database rows and encrypted `.enc` files into an authenticated AES-256-GCM backup envelope in `server/backups/veratrace_backup_<timestamp>.json`.

### Restoring Backups
Backups can be restored via API:
```bash
curl -X POST http://localhost:4000/api/backup/restore \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"backupFileName": "veratrace_backup_2026-11-22T18-00-00.json"}'
```

### Crash Recovery & Journal
VeraTrace includes automated restoration journaling (`pending_restores` table). If the server crashes or power fails during a restore promotion:
1. Upon server startup, `recoverPendingRestores(db)` automatically detects pending restores.
2. It completes promotion of any unpromoted files from the staging directory.
3. It cleans up temporary staging folders and marks the restore journal as `COMPLETED`.
4. Any uncommitted staging folders from pre-commit crashes are safely purged without leaving orphan files.

---

## 5. Cryptographic Key Backup & Recovery

The three master key files in `server/data/` must be backed up securely offline:
1. `.vault_master.key` (Vault AES-256 master key)
2. `.custody_ed25519.key` (Custody chain audit signing private key)
3. `.auth_master.key` (JWT authentication secret)

> [!CAUTION]
> If `.vault_master.key` is lost while encrypted evidence files exist, VeraTrace intentionally refuses to boot to prevent silent data destruction. To recover, restore the backup keyfile to `server/data/.vault_master.key` or set `VERATRACE_VAULT_KEY` in `.env`.

---

## 6. Pre-Flight Production Deployment Checklist

- [ ] **Persistent Storage**: Confirmed `server/data/` and `server/vault_storage/` reside on a persistent block volume.
- [ ] **Environment**: `NODE_ENV=production` configured.
- [ ] **Origins**: `ALLOWED_ORIGINS` points strictly to `https://veratrace-app.vercel.app` (no wildcard `*` or localhost).
- [ ] **Secrets**: High-entropy keys configured for `VERATRACE_VAULT_KEY` and `VERATRACE_JWT_SECRET` (or keyfiles backed up offline).
- [ ] **Reverse Proxy / TLS**: Reverse proxy (Nginx / Caddy / Cloudflare) configured with TLS 1.3 termination and HTTPS redirection.
- [ ] **File Size Limits**: Reverse proxy `client_max_body_size` set to at least `100M` to match application limits.
- [ ] **File Permissions**: Confirmed keyfiles have restricted permissions (`0o600` on POSIX, NTFS DACLs via `icacls` on Windows).
- [ ] **Health Check**: Monitoring configured against `GET /api/health` (expects HTTP 200 with JSON status).
- [ ] **Smoke Test**: Executed smoke tests for registration, case creation, and extension pairing.
