# Deploy Noesis on AWS EC2

This guide runs the FastAPI backend and React UI on one **Ubuntu 24.04 x86_64 EC2 server**. Docker runs the app on a private Compose network, and Caddy serves both UI and API over HTTPS. Sign-in and access control are enforced by FastAPI. Google and Microsoft OIDC setup is documented in [`../docs/AUTH_SETUP.md`](../docs/AUTH_SETUP.md).

The app requires the user to upload a `.pt` model at runtime; there is no default bundled model to preserve in the image.

## 1. Create the EC2 server

Launch an Ubuntu Server 24.04 LTS instance using the **64-bit (x86)** AMI. Allocate and associate an Elastic IP so the address remains stable.

In the instance's AWS security group, add inbound rules:

| Type | Port | Source |
| --- | ---: | --- |
| SSH | 22 | Your current public IP address only |
| HTTP | 80 | `0.0.0.0/0` and, if using IPv6, `::/0` |
| HTTPS | 443 | `0.0.0.0/0` and, if using IPv6, `::/0` |

No iptables changes are needed on the Ubuntu AMI. Keep SSH restricted to your own IP.

Connect to the instance:

```bash
ssh -i /path/to/key.pem ubuntu@YOUR_ELASTIC_IP
```

## 2. Add 4 GB of swap

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Confirm it is active:

```bash
free -h
```

## 3. Install Docker Engine and the Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out and reconnect for the `docker` group change to take effect, then verify:

```bash
docker --version
docker compose version
```

## 4. Point DuckDNS at the Elastic IP

At [DuckDNS](https://www.duckdns.org/), create the `faneosis` subdomain. Set its IPv4 address to the instance's Elastic IP. Wait for DNS to resolve before starting Caddy; Caddy needs the public name to obtain an HTTPS certificate.

From the EC2 server, you can check the result with:

```bash
getent ahostsv4 faneosis.duckdns.org
```

The returned address should be your Elastic IP.

## 5. Clone the project and configure authentication

```bash
cd ~
git clone https://github.com/namanfa/neosis__backend.git
cd ~/neosis__backend/deploy
cp .env.example .env
```

## 6. Configure sign-in

Follow [`../docs/AUTH_SETUP.md`](../docs/AUTH_SETUP.md) to configure Google OIDC. Set `APP_BASE_URL`, Google client values, `SESSION_SECRET`, and the approved email domain allowlist in the private `deploy/.env`. Microsoft sign-in is deferred until a later configuration change. Provider secrets are consumed only by the backend; never place them in frontend configuration.

## 7. Build and start the app

From `~/neosis__backend/deploy`:

```bash
docker compose up -d --build
docker compose ps
```

The app listens only inside the Compose network on port `7860`. Caddy publishes ports `80` and `443`, obtains and renews HTTPS certificates, and proxies requests to the app. The UI and API share `https://faneosis.duckdns.org`. The Docker Compose setup mounts `deploy/data` at `/data`; temporary Labeler sessions use `/data/sessions`, while the persistent image library uses `/data/library` with `STORAGE_BACKEND=local` by default.

## Use Cloudflare R2 for the shared image library

The R2 adapter is selected with `STORAGE_BACKEND=r2`. In `deploy/.env`, set:

```dotenv
STORAGE_BACKEND=r2
R2_ENDPOINT_URL=https://ac88413dc5847b0e11784fbc87b2c205.r2.cloudflarestorage.com
R2_BUCKET_NAME=neosis-image-library
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_REGION=auto
```

Use an R2 API token with **Object Read & Write**, scoped to this bucket. The endpoint is the account-level S3 endpoint; the bucket name is configured separately. Keep `deploy/.env` private. It is excluded from Git and the Docker build context. Do not enable public bucket access: the app creates short-lived signed read links for private images.

Then rebuild the app from `deploy/`:

```bash
docker compose up -d --build
docker compose logs -f app
```

This switches the shared Testing Images and Packshots library to R2. Existing files under `output/library` or `deploy/data/library` are not copied automatically; migrate them before switching if you need to keep them. Labeler session uploads and temporary Image Extraction jobs remain on the app's local session storage and are not moved to R2 by this setting.

Open `https://faneosis.duckdns.org` in a browser and sign in with an approved work account. The `/health` endpoint is public for health checks:

```bash
curl https://faneosis.duckdns.org/health
```

## Session cleanup

The app's persistent scheduler scans every minute and removes owned Pseudo Labelling, Image Extraction, and Accuracy Report temporary data after 24 hours without activity, including its ownership rows. It skips active operations and never automatically deletes unowned legacy folders. Inspect legacy candidates first with `docker compose exec app python -m services.session_cleanup`; deletion requires the explicit `--apply` option. Back up any legacy data before opting in.

## Update the deployment

```bash
cd ~/neosis__backend
git pull
cd deploy
docker compose up -d --build
```

## Debugging

Follow the app logs:

```bash
cd ~/neosis__backend/deploy
docker compose logs -f app
```

For Caddy logs, use:

```bash
docker compose logs -f caddy
```

If HTTPS does not come up, check that the DuckDNS name resolves to the Elastic IP, ports 80 and 443 are open in the AWS security group, and the `DOMAIN` value matches the hostname in the browser.
