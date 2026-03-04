# AIP scraper on AWS EC2 – step-by-step setup

This guide walks you through creating a **separate** EC2 instance dedicated to EAD AIP scraping: login to EAD Basic, download AD 2 PDFs, and extract airport data (regex or AI). Uses the **same S3 bucket** as your NOTAM scraper (different prefix `aip/`). **Credentials** can be stored on the instance in `.env` (for cron or SSH runs) or **passed in the API request** when you trigger download/extract from the portal (**/aip-test**), so the EC2 does not need to store them (like NOTAMs).

**What runs on this instance:**

1. **Download:** `ead-download-aip-pdf.mjs` – Playwright + Chromium, one ICAO per run.
2. **Extract:** `ead-extract-aip-from-pdf.mjs` (regex) or `ead-extract-aip-from-pdf-ai.mjs` (OpenAI).
3. **Upload (optional):** `ead-aip-extracted.json` → S3 `your-bucket/aip/`; and per-ICAO cache → `your-bucket/aip/ead/ICAO.json` (portal reads from S3 like NOTAMs).

**Triggering runs:** You can run the scripts via SSH/cron on EC2 (then credentials must be in `.env`), or trigger them from the **portal** at **/aip-test** by passing credentials in the request (no `.env` on EC2 needed).

**Important – EAD may block EC2/datacenter IPs:** The EAD Basic site sometimes returns **"IB-101: Access denied"** for requests from cloud/datacenter IPs (e.g. AWS EC2). If you see that on EC2, the **download** step cannot run there. **Workaround:** run the download **locally** (your PC or a machine on a non-datacenter network), then either (a) copy `data/ead-aip/*.pdf` to EC2 and run extract + S3 upload on EC2, or (b) run extract locally and upload `ead-aip-extracted.json` to S3. Use **Sync on EC2** only if EAD allows your EC2 IP; otherwise use **Download PDF** and **Extract** on **/aip-test** from your laptop.

---

## Step 0: IAM for AIP EC2 (reuse same bucket as NOTAMs)

You already have an IAM policy/role for the NOTAM EC2 and an IAM user for S3 (e.g. for Vercel to read NOTAMs). For the **new AIP EC2** you only need a **new role** so this instance can write to S3. Use the **same bucket** as NOTAMs (e.g. `myapp-notams-prod`) with prefix `**aip/`**.

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

1. **Next** → **Policy name:** e.g. `AIPScraperS3Upload` → **Create policy**.

### 0b. Create a role for the AIP EC2 instance

1. **IAM** → **Roles** → **Create role**.
2. **Trusted entity:** AWS service → **EC2** → **Next**.
3. **Permissions:** Search for `AIPScraperS3Upload`, tick it → **Next**.
4. **Role name:** e.g. `AIPScraperEC2Role` → **Create role**.

You will attach this role to the AIP EC2 in Step 1. Your NOTAM EC2 keeps its existing role unchanged.

**If the portal (Vercel) should read AIP from S3:** Ensure the IAM **user** you use for S3 read access has `s3:GetObject` on the bucket (or on `aip/`*). If that user already has access to the whole bucket (e.g. `arn:aws:s3:::myapp-notams-prod/*`), it can already read `aip/ead-aip-extracted.json`; no change needed.

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
  - **IAM instance profile:** Select **AIPScraperEC2Role** (from Step 0). This gives the instance S3 access to `your-bucket/aip/`* without storing keys.
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

1. **Install dependencies** (skip if User data already did it):

```bash
sudo bash -c 'export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium
npm install -g npm@latest'
```

1. **Clone the repo** and install Node dependencies:

```bash
cd ~
git clone https://github.com/YOUR-ORG/clearway-2.git
cd clearway-2
npm install
```

1. **Install Playwright browsers** (Chromium – used by the download script):

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

## Step 4: Credentials (env or pass in API request)

You can either store credentials on the EC2 in `.env`, or **not store them** and pass them in the API request (e.g. from the portal or a sync server that holds them in Vercel env), like NOTAMs.

**Option A – Store on EC2 in `.env` (for cron / manual runs)**

On the EC2 instance:

```bash
cd ~/clearway-2
nano .env
```

Add (replace with your real values):

```bash
EAD_USER=YourEadUsername
EAD_PASSWORD_ENC=YourBase64EncodedPassword
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

To generate `EAD_PASSWORD_ENC`: run `node scripts/ead-encode-password.mjs "YourEadPassword"` (e.g. on your laptop) and paste the output. Save and exit (Ctrl+O, Enter, Ctrl+X in nano).

**Option B – Do not store on server; pass in request**

If you trigger download/extract via the portal (**/aip-test**) or another API client, the request body can carry credentials so the server does not need them in `.env`:

- **Download:** POST body may include `eadUser`, `eadPassword` (or `eadPasswordEnc` base64). If present, the API passes them into the script env and does not read `EAD_`* from process env.
- **Extract (AI):** POST body may include `openaiApiKey`, `openaiModel`. If present, the API passes them into the script env.

On **/aip-test**, open “Credentials (optional – pass in request instead of server .env)” and enter EAD user/password and OpenAI key. They are sent only in that request and are not stored on the server. To have the **AIP EC2** run the jobs when you click **Sync on EC2**, use the **AIP sync server** (Step 5b): it uses the **same sync secret** as the NOTAM sync server (`SYNC_SECRET` on EC2, `NOTAM_SYNC_SECRET` in Vercel), so you do not need a second secret.

---

## Step 5: Run download and extract

**Where to run:** Either on the EC2 instance via SSH (or cron), or from the **portal** at **/aip-test** (credentials passed in the request; see Step 4 Option B).

**On EC2 via SSH** – All commands below are run on the instance, from `~/clearway-2`. For these CLI runs the scripts read `EAD_`* and `OPENAI_*` from the environment, so you need **Option A** (`.env` on the instance). If you prefer not to store credentials on EC2, trigger download/extract from the portal (**/aip-test**) and fill in the optional credentials form; the API will pass them into the script.

**Single ICAO (download then extract):**

The download script runs headless. On EC2, `xvfb-run` is recommended:

```bash
cd ~/clearway-2
xvfb-run -a -s "-screen 0 1920x1200x24" node scripts/ead-download-aip-pdf.mjs ESGG
node scripts/ead-extract-aip-from-pdf.mjs
```

Use **AI extraction** instead of regex (requires `OPENAI_API_KEY` in `.env` for CLI):

```bash
node scripts/ead-extract-aip-from-pdf-ai.mjs
```

**Multiple ICAOs (download each, then extract once):**

```bash
cd ~/clearway-2
for icao in ESGG EVAD EBAM; do
  xvfb-run -a -s "-screen 0 1920x1200x24" node scripts/ead-download-aip-pdf.mjs "$icao"
done
node scripts/ead-extract-aip-from-pdf.mjs
# or: node scripts/ead-extract-aip-from-pdf-ai.mjs
```

**Results:**

- PDFs: `~/clearway-2/data/ead-aip/*.pdf`
- Extracted JSON: `~/clearway-2/data/ead-aip-extracted.json`

You can copy them to your laptop with `scp`:

```bash
# From your laptop:
scp -i your-key.pem -r ubuntu@EC2-PUBLIC-IP:~/clearway-2/data/ead-aip-extracted.json ./
scp -i your-key.pem -r ubuntu@EC2-PUBLIC-IP:~/clearway-2/data/ead-aip ./
```

---

## Step 5b: Run the AIP sync server on EC2 (optional – "Sync on EC2" from portal)

Like the NOTAM sync server, the AIP sync server runs on the EC2 and accepts authenticated requests from the portal. When you click **Sync on EC2** on **/aip-test**, the portal calls this server, which runs download + extract for the given ICAO and returns the result (and optionally uploads to S3). **The same sync secret is used as for NOTAMs:** set `SYNC_SECRET` on the AIP EC2 to the same value as `NOTAM_SYNC_SECRET` in Vercel.

**Note:** If EAD returns "Access denied" for your EC2 IP (see note at the top of this doc), **Sync on EC2** will fail at the download step. In that case run **Download PDF** and **Extract** from **/aip-test** on your laptop instead, or run download locally and copy PDFs to EC2 for extract/upload.

1. **Create a `.env` on EC2** (recommended) so you don’t type secrets in the shell. From the project root:

```bash
cd ~/clearway-2
nano .env
```

Add (replace with your values):

```bash
# Sync auth (same value as NOTAM_SYNC_SECRET in Vercel)
SYNC_SECRET=your-same-secret-as-notam-sync

# S3 (same bucket as NOTAMs – portal reads aip/ead/ICAO.json from here)
AWS_S3_BUCKET=myapp-notams-prod
AWS_REGION=eu-north-1

# EAD Basic login (use EAD_PASSWORD_ENC from: node scripts/ead-encode-password.mjs "YourPassword")
EAD_USER=YourEadUsername
EAD_PASSWORD_ENC=YourBase64EncodedPassword

# OpenAI (for AI extract; optional OPENAI_MODEL, default gpt-4o-mini)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Save and exit (Ctrl+O, Enter, Ctrl+X). Optional: if you use system Chromium instead of Playwright’s, add `CHROME_CHANNEL=chromium`.

2. **Run the sync server in tmux** (so it keeps running after you exit SSH):

```bash
tmux new -s aip
cd ~/clearway-2
set -a && . ./.env && set +a
node scripts/aip-sync-server.mjs
```

You should see: `AIP sync server listening on port 3002 | download: ... | extract: AI`. Then **detach** from tmux: press **Ctrl+B**, release, then **D**. You can close SSH; the server keeps running. To reattach later: `tmux attach -t aip`.

**If you prefer not to use `.env`**, run the same in tmux but export vars by hand:

```bash
tmux new -s aip
cd ~/clearway-2
export AWS_S3_BUCKET=myapp-notams-prod AWS_REGION=eu-north-1 SYNC_SECRET=your-secret
export EAD_USER=YourEadUsername EAD_PASSWORD_ENC=YourBase64EncodedPassword
export OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
node scripts/aip-sync-server.mjs
# Detach: Ctrl+B then D
```

The server listens on port **3002** (or `AIP_SYNC_PORT`). It accepts `GET /sync?icao=XXXX`; when called, it runs download for that ICAO, then AI extract, returns the JSON, and uploads to S3 (`aip/ead-aip-extracted.json` and `aip/ead/ICAO.json`) if `AWS_S3_BUCKET` is set.

3. **Expose the server:** open port **3002** in the EC2 security group (Source: 0.0.0.0/0 or your Vercel IPs). The sync URL will be `http://EC2-PUBLIC-IP:3002`.
4. **In Vercel** add:
  - **Name:** `AIP_SYNC_URL`  
   **Value:** `http://EC2-PUBLIC-IP:3002` (no trailing slash).
  - **NOTAM_SYNC_SECRET** is already set for NOTAM sync; the AIP sync server uses the same secret (`SYNC_SECRET` on EC2 must match `NOTAM_SYNC_SECRET` in Vercel). No extra variable needed.

After that, **Sync on EC2** on **/aip-test** will trigger the scraper on the AIP EC2 and return fresh extracted data.

---

## Step 6: Run on a schedule (optional)

Cron runs the scripts **directly on EC2**, so it does not go through the API. You must use **Option A** (`.env` on the instance) for cron; credentials cannot be “passed in request” for cron.

To run AIP download + extract daily (e.g. at 03:00 UTC):

```bash
crontab -e
```

Add (replace ICAO list and bucket if needed):

```
0 3 * * * cd /home/ubuntu/clearway-2 && . .env 2>/dev/null; for icao in ESGG EVAD EBAM; do xvfb-run -a -s "-screen 0 1920x1200x24" node scripts/ead-download-aip-pdf.mjs "$icao"; done && node scripts/ead-extract-aip-from-pdf-ai.mjs
```

- Ensure `.env` exists in `/home/ubuntu/clearway-2` with `EAD_USER`, `EAD_PASSWORD_ENC`, and (for AI) `OPENAI_API_KEY`.
- If you use **Option B only** (no `.env` on EC2), you cannot use cron; trigger runs from the portal **/aip-test** instead.

---

## Step 7: Upload results to S3 (same bucket as NOTAMs)

With the IAM role from Step 0, the instance can write to `your-bucket/aip/` without access keys. After extraction, upload (replace `myapp-notams-prod` with your bucket name):

```bash
cd ~/clearway-2
aws s3 cp data/ead-aip-extracted.json s3://myapp-notams-prod/aip/ead-aip-extracted.json
```

**Include in cron (Step 6)** so every run uploads to S3:

```
0 3 * * * cd /home/ubuntu/clearway-2 && . .env 2>/dev/null; for icao in ESGG EVAD EBAM; do xvfb-run -a -s "-screen 0 1920x1200x24" node scripts/ead-download-aip-pdf.mjs "$icao"; done && node scripts/ead-extract-aip-from-pdf-ai.mjs && aws s3 cp data/ead-aip-extracted.json s3://myapp-notams-prod/aip/ead-aip-extracted.json
```

The portal already reads EAD extracted data from the repo file `data/ead-aip-extracted.json`. To have it read from S3 instead (e.g. after deploy), you’d add an API or build step that fetches `s3://myapp-notams-prod/aip/ead-aip-extracted.json`; your existing IAM user used for S3 (e.g. by Vercel) can read this object if it has access to the bucket.

---

## Summary


| Step | Action                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | IAM: policy `AIPScraperS3Upload` (bucket `aip/*`), role `AIPScraperEC2Role`.                                                                                                      |
| 1    | Launch EC2 (Ubuntu 22.04, t3.small), attach **AIPScraperEC2Role**, open SSH (22).                                                                                                 |
| 2    | Optional: User data to install Node, Xvfb, Chromium.                                                                                                                              |
| 3    | SSH in; if no User data, install deps; clone repo, `npm install`, `npx playwright install chromium`.                                                                              |
| 4    | **Credentials:** Option A – `.env` on EC2 (`EAD_USER`, `EAD_PASSWORD_ENC`, `OPENAI_API_KEY`). Option B – pass in API request from **/aip-test** (no `.env` on EC2).               |
| 5    | Run download (with `xvfb-run`) per ICAO, then extract (regex or AI). On EC2 CLI: needs Option A. Or trigger from portal **/aip-test** with Option B.                              |
| 5b   | Optional: AIP sync server – `node scripts/aip-sync-server.mjs` on EC2 (port 3002). Use **same** `SYNC_SECRET` as NOTAMs. In Vercel set `AIP_SYNC_URL`; reuse `NOTAM_SYNC_SECRET`. |
| 6    | Optional: cron for daily run (requires Option A `.env` on EC2).                                                                                                                   |
| 7    | Upload `ead-aip-extracted.json` to S3 (`your-bucket/aip/`).                                                                                                                       |


**Env (EC2 sync server):** `SYNC_SECRET` (same as NOTAM), `EAD_USER`, `EAD_PASSWORD_ENC`, `OPENAI_API_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`. **Vercel:** `AIP_SYNC_URL` (e.g. `http://EC2-IP:3002`), reuse existing `NOTAM_SYNC_SECRET`.

**Cost:** t3.small on-demand is about **$0.0208/hour** (~$15/month if 24/7). You can stop the instance when not needed to save cost.