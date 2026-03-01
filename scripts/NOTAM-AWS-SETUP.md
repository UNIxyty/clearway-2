# NOTAM scraper on AWS (EC2 + virtual display)

Use an **EC2 instance** with a **virtual display (Xvfb)** so the browser runs in “headed” mode and is less likely to be blocked by the FAA site. The scraper uploads NOTAMs to **S3**; your portal reads from S3.

## Architecture

1. **EC2 worker** – Ubuntu, runs Chrome with Xvfb (virtual display), executes the NOTAM scraper.
2. **S3 bucket** – Stores NOTAM JSON per ICAO, e.g. `s3://your-bucket/notams/DBBB.json`.
3. **Portal** – Next.js API reads NOTAMs from S3 when `AWS_NOTAMS_BUCKET` is set (no local scraper run).

## 1. Create S3 bucket

- In AWS Console: S3 → Create bucket (e.g. `your-app-notams`).
- (Optional) Restrict access with bucket policy; ensure the EC2 instance role and the Next.js app (if on AWS) can read/write as needed.

## 2. Launch EC2 instance

- **AMI:** Ubuntu 22.04 LTS.
- **Instance type:** e.g. `t3.small` (1 vCPU, 2 GB RAM).
- **IAM role:** Attach a role that has `s3:PutObject`, `s3:GetObject` on your NOTAM bucket.
- **User data** (optional) – or run the install steps once via SSH:

```bash
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb chromium-browser nodejs npm unzip
# Install Node 18+ if apt has older version
# curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
# apt-get install -y nodejs
npm install -g npm@latest
```

Or install Chrome (official) instead of chromium-browser:

```bash
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable
```

## 3. Deploy the app (or just the script) on EC2

Copy your project (or at least `scripts/notam-scraper.mjs`, `package.json`, and run `npm install` so Playwright + Chrome and `@aws-sdk/client-s3` are available).  
If you use system Chrome instead of Playwright’s, install Playwright and then:

```bash
npx playwright install chromium
# or use system Chrome only (see below)
```

## 4. Run the scraper with virtual display and S3 upload

Use **Xvfb** so the browser has a virtual display (often helps with “Access Denied”):

```bash
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 &
export USE_HEADED=1
export AWS_S3_BUCKET=your-app-notams
export AWS_REGION=us-east-1
# Optional: AWS credentials if not using instance role
# export AWS_ACCESS_KEY_ID=...
# export AWS_SECRET_ACCESS_KEY=...

node scripts/notam-scraper.mjs --json DBBB
```

Or in one line:

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" env USE_HEADED=1 AWS_S3_BUCKET=your-app-notams node scripts/notam-scraper.mjs --json DBBB
```

- With `USE_HEADED=1`, the script launches a headed browser (uses the virtual display).
- With `AWS_S3_BUCKET` set, the script uploads NOTAMs to `s3://your-app-notams/notams/DBBB.json` (prefix `notams/` is default).

## 5. Point the portal at S3

On the machine (or container) where the Next.js app runs, set:

- `AWS_NOTAMS_BUCKET=your-app-notams` (or reuse `AWS_S3_BUCKET` if you prefer).
- (Optional) `AWS_NOTAMS_PREFIX=notams` if you use a different prefix.
- `AWS_REGION=us-east-1` (or your bucket region).

Restart the app. The `/api/notams?icao=DBBB` route will **read from S3** when the bucket is set; it no longer runs the scraper locally.

## 6. When to run the scraper on EC2

- **On demand** – SSH (or SSM) into EC2 and run the command above for one or more ICAOs.
- **Cron** – e.g. every 6 hours for a list of ICAOs:

```bash
0 */6 * * * cd /home/ubuntu/your-app && xvfb-run -a env USE_HEADED=1 AWS_S3_BUCKET=your-app-notams node scripts/notam-scraper.mjs --json DBBB >> /var/log/notam.log 2>&1
```

- **Triggered by API** – e.g. Lambda or another endpoint that sends a message to SQS; the EC2 instance runs a worker that consumes the queue and runs the scraper for the requested ICAO, then uploads to S3.

## 7. Using system Chrome on EC2

If you installed Google Chrome and want the script to use it instead of Playwright’s Chromium:

- Install Playwright: `npm install playwright` (no need to install Chromium).
- Set `CHROME_CHANNEL=chrome` (script already prefers `channel: 'chrome'` when available).
- Run with Xvfb as above; the script will use the system Chrome binary.

## 8. Troubleshooting

- **Access Denied from FAA** – Run with `USE_HEADED=1` and Xvfb. If it still blocks, try a different region or a residential-style proxy (use with care and respect FAA ToS).
- **S3 upload fails** – Check IAM permissions (`s3:PutObject`) and `AWS_S3_BUCKET` / `AWS_REGION`. On EC2, prefer an instance role over access keys.
- **No NOTAMs in portal** – Ensure `AWS_NOTAMS_BUCKET` is set in the Next.js environment and the object exists at `s3://bucket/notams/ICAO.json` (run the scraper once for that ICAO).
