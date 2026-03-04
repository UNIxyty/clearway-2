# AIP scraper on AWS EC2 – step-by-step setup

This guide walks you through creating a **separate** EC2 instance dedicated to EAD AIP scraping: login to EAD Basic, download AD 2 PDFs, and extract airport data (regex or AI). Uses the **same S3 bucket** as your NOTAM scraper (different prefix `aip/`).

**What runs on this instance:**

1. **Download:** `ead-download-aip-pdf.mjs` – Playwright + Chromium, one ICAO per run.
2. **Extract:** `ead-extract-aip-from-pdf.mjs` (regex) or `ead-extract-aip-from-pdf-ai.mjs` (OpenAI).
3. **Upload (optional):** `ead-aip-extracted.json` → S3 `your-bucket/aip/`.

---

## Step 0: IAM for AIP EC2 (reuse same bucket as NOTAMs)

You already have an IAM policy/role for the NOTAM EC2 and an IAM user for S3 (e.g. for Vercel to read NOTAMs). For the **new AIP EC2** you only need a **new role** so this instance can write to S3. Use the **same bucket** as NOTAMs (e.g. `myapp-notams-prod`) with prefix **`aip/`**.

### 0a. Create a policy for AIP S3 upload (same bucket, `aip/` prefix)

1. **IAM** → **Policies** → **Create policy**.
2. **JSON** tab, paste (replace `myapp-notams-prod` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::myapp-notams-prod/aip/*"
    }
  ]
}
```

3. **Next** → **Policy name:** e.g. `AIPScraperS3Upload` → **Create policy**.

### 0b. Create a role for the AIP EC2 instance

1. **IAM** → **Roles** → **Create role**.
2. **Trusted entity:** AWS service → **EC2** → **Next**.
3. **Permissions:** Search for `AIPScraperS3Upload`, tick it → **Next**.
4. **Role name:** e.g. `AIPScraperEC2Role` → **Create role**.

You will attach this role to the AIP EC2 in Step 1. Your NOTAM EC2 keeps its existing role unchanged.

**If the portal (Vercel) should read AIP from S3:** Ensure the IAM **user** you use for S3 read access has `s3:GetObject` on the bucket (or on `aip/*`). If that user already has access to the whole bucket (e.g. `arn:aws:s3:::myapp-notams-prod/*`), it can already read `aip/ead-aip-extracted.json`; no change needed.

---

## Step 1: Launch the EC2 instance

1. In **AWS Console** go to **EC2** → **Launch instance**.
2. **Name:** e.g. `aip-scraper`.
3. **AMI:** **Ubuntu Server 22.04 LTS**.
4. **Instance type:** **t3.small** (2 vCPU, 2 GB RAM) – enough for one Chrome/Chromium session. Use t3.micro only if you run AIP rarely and accept slower runs.
5. **Key pair:** Create a new key pair or select the **same** one you use for your NOTAM scraper (e.g. `your-key.pem`).
6. **Network:** Default VPC, public subnet. **Security group:** allow **SSH (port 22)** from your IP.
7. **Storage:** 8–20 GB.
8. **Advanced details:**
   - **IAM instance profile:** Select **AIPScraperEC2Role** (from Step 0). This gives the instance S3 access to `your-bucket/aip/*` without storing keys.
   - **User data:** Optional. If available, paste the script from **Step 2** so dependencies install on first boot. Otherwise install manually in Step 3.
9. **Launch instance**. Note the **Public IPv4 address** once it is running.

---

## Step 2: User data script (optional – run at first boot)

If you chose to use **User data** in Step 1, paste this. Otherwise skip and run the same commands manually in Step 3.

```bash
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb unzip

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Chromium (used by Playwright for EAD)
apt-get install -y chromium-browser || apt-get install -y chromium

npm install -g npm@latest
```

If you use **User data**, wait 2–3 minutes after the instance is running before SSH and cloning the repo.

---

## Step 3: SSH and install (if you didn’t use User data)

1. **SSH** into the instance (replace path to your key and the public IP):

```bash
ssh -i /path/to/your-key.pem ubuntu@EC2-PUBLIC-IP
```

2. **Install dependencies** (skip if User data already did it):

```bash
sudo bash -c 'export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium
npm install -g npm@latest'
```

3. **Clone the repo** and install Node dependencies:

```bash
cd ~
git clone https://github.com/YOUR-ORG/clearway-2.git
cd clearway-2
npm install
```

4. **Install Playwright browsers** (Chromium – used by the download script):

```bash
npx playwright install chromium
npx playwright install-deps chromium
```

If the system already has Chromium and you prefer to use it (like the NOTAM setup), you can set `CHROME_CHANNEL=chromium` when running and install Chromium only:

```bash
sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
```

Then in the project we use `CHROME_CHANNEL=chromium` so Playwright uses the system Chromium.

---

## Step 4: Configure credentials

On the EC2 instance, create a `.env` in the project root (never commit this file):

```bash
cd ~/clearway-2
nano .env
```

Add (replace with your real values):

```bash
# EAD Basic – required for download
EAD_USER=YourEadUsername
EAD_PASSWORD_ENC=YourBase64EncodedPassword
```

To generate `EAD_PASSWORD_ENC` from your password (run once on your laptop or any machine with Node):

```bash
node scripts/ead-encode-password.mjs "YourEadPassword"
```

Paste the output into `.env` as `EAD_PASSWORD_ENC=...`.

**Optional – for AI extraction:**

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Save and exit (Ctrl+O, Enter, Ctrl+X in nano).

---

## Step 5: Run download and extract

All commands below are run on the EC2 instance, from `~/clearway-2`.

**Single ICAO (download then extract):**

The download script runs headless. On EC2, `xvfb-run` is recommended in case the environment needs a virtual display:

```bash
cd ~/clearway-2
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/ead-download-aip-pdf.mjs ESGG
node scripts/ead-extract-aip-from-pdf.mjs
```

Use **AI extraction** instead of regex:

```bash
node scripts/ead-extract-aip-from-pdf-ai.mjs
```

**Multiple ICAOs (download each, then extract once):**

```bash
cd ~/clearway-2
for icao in ESGG EVAD EBAM; do
  xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/ead-download-aip-pdf.mjs "$icao"
done
node scripts/ead-extract-aip-from-pdf.mjs
# or: node scripts/ead-extract-aip-from-pdf-ai.mjs
```

Results:

- PDFs: `~/clearway-2/data/ead-aip/*.pdf`
- Extracted JSON: `~/clearway-2/data/ead-aip-extracted.json`

You can copy them to your laptop with `scp`:

```bash
# From your laptop:
scp -i your-key.pem -r ubuntu@EC2-PUBLIC-IP:~/clearway-2/data/ead-aip-extracted.json ./
scp -i your-key.pem -r ubuntu@EC2-PUBLIC-IP:~/clearway-2/data/ead-aip ./
```

---

## Step 6: Run on a schedule (optional)

To run AIP download + extract daily (e.g. at 03:00 UTC):

```bash
crontab -e
```

Add:

```
0 3 * * * cd /home/ubuntu/clearway-2 && . .env 2>/dev/null; for icao in ESGG EVAD EBAM; do xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/ead-download-aip-pdf.mjs "$icao"; done && node scripts/ead-extract-aip-from-pdf-ai.mjs
```

Adjust the list of ICAOs and the extraction script (regex vs AI) as needed. Ensure `.env` is in `/home/ubuntu/clearway-2` and that cron can read it (e.g. no interactive prompts).

---

## Step 7: Upload results to S3 (same bucket as NOTAMs)

With the IAM role from Step 0, the instance can write to `your-bucket/aip/` without access keys. After extraction, upload (replace `myapp-notams-prod` with your bucket name):

```bash
cd ~/clearway-2
aws s3 cp data/ead-aip-extracted.json s3://myapp-notams-prod/aip/ead-aip-extracted.json
```

**Include in cron (Step 6)** so every run uploads to S3:

```
0 3 * * * cd /home/ubuntu/clearway-2 && . .env 2>/dev/null; for icao in ESGG EVAD EBAM; do xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/ead-download-aip-pdf.mjs "$icao"; done && node scripts/ead-extract-aip-from-pdf-ai.mjs && aws s3 cp data/ead-aip-extracted.json s3://myapp-notams-prod/aip/ead-aip-extracted.json
```

The portal already reads EAD extracted data from the repo file `data/ead-aip-extracted.json`. To have it read from S3 instead (e.g. after deploy), you’d add an API or build step that fetches `s3://myapp-notams-prod/aip/ead-aip-extracted.json`; your existing IAM user used for S3 (e.g. by Vercel) can read this object if it has access to the bucket.

---

## Summary

| Step | Action |
|------|--------|
| 0 | IAM: policy `AIPScraperS3Upload` (bucket `aip/*`), role `AIPScraperEC2Role`. |
| 1 | Launch EC2 (Ubuntu 22.04, t3.small), attach **AIPScraperEC2Role**, open SSH (22). |
| 2 | Optional: User data to install Node, Xvfb, Chromium. |
| 3 | SSH in; if no User data, install deps; clone repo, `npm install`, `npx playwright install chromium`. |
| 4 | Create `.env` with `EAD_USER`, `EAD_PASSWORD_ENC`, optional `OPENAI_API_KEY`. |
| 5 | Run download (with `xvfb-run`) per ICAO, then extract (regex or AI). |
| 6 | Optional: cron for daily run. |
| 7 | Upload `ead-aip-extracted.json` to S3 (`your-bucket/aip/`). |

**Cost:** t3.small on-demand is about **$0.0208/hour** (~$15/month if 24/7). You can stop the instance when not needed to save cost.
