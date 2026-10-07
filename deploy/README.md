# Deploy Noesis on AWS EC2

This guide runs the FastAPI backend and React UI on one **Ubuntu 24.04 x86_64 EC2 server**. Docker runs the app on a private Compose network, and Caddy serves both UI and API from the same HTTPS origin with HTTP Basic Authentication.

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

Generate a Caddy password hash. Enter the password when prompted:

```bash
docker run --rm -it caddy:2 caddy hash-password
```

Edit `deploy/.env` and set `AUTH_HASH` to the generated hash, keeping it inside single quotes. For example:

```dotenv
DOMAIN=faneosis.duckdns.org
AUTH_USER=team
AUTH_HASH='$2a$14$REPLACE_WITH_THE_GENERATED_HASH'
```

Keep the single quotes around the hash so Docker Compose does not interpolate its `$` characters. If authentication fails, double every `$` in the hash as `$$`. Use a strong password and keep `.env` private; it is excluded from Git and the Docker build context.

## 6. Build and start the app

From `~/neosis__backend/deploy`:

```bash
docker compose up -d --build
docker compose ps
```

The app listens only inside the Compose network on port `7860`. Caddy publishes ports `80` and `443`, obtains and renews HTTPS certificates, and proxies requests to the app. The UI and API share `https://faneosis.duckdns.org`.

Open `https://faneosis.duckdns.org` in a browser and sign in with `AUTH_USER` and the password used to generate `AUTH_HASH`. The app's health endpoint is also protected by the same login:

```bash
curl -u team https://faneosis.duckdns.org/health
```

## 7. Delete session folders older than two days

Sessions are stored under `deploy/data/sessions`. Add a daily cleanup job for the `ubuntu` user:

```bash
crontab -e
```

Add this line, adjusting the path if the repository is stored elsewhere:

```cron
0 3 * * * find /home/ubuntu/neosis__backend/deploy/data/sessions -mindepth 1 -maxdepth 1 -type d -mmin +2880 -exec rm -rf -- {} \;
```

This removes session directories whose own modification time is older than 2,880 minutes. It permanently deletes those sessions and their uploaded/generated files.

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
