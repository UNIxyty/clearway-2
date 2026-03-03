# NOTAM scraper on AWS – step-by-step setup

This guide walks you through running the NOTAM scraper on an EC2 instance with a virtual display (Xvfb), uploading results to S3, and having your portal (e.g. on Vercel) read NOTAMs from S3 via the API.

**Architecture:**

1. **EC2** – Runs the scraper (Chrome + Xvfb), uploads NOTAM JSON to S3. Optionally runs a **sync server** so the portal can trigger a live scrape when a user requests an ICAO.
2. **S3** – Stores one JSON file per airport, e.g. `s3://YOUR-BUCKET/notams/DBBB.json`.
3. **Portal** – Next.js app. When the user enters an ICAO (e.g. DBBB), the app calls the EC2 sync server to run the scraper live, then returns the fresh data. With `AWS_NOTAMS_BUCKET` set it can also read cached data from S3.

**NOTAM source:** By default the scraper uses **CrewBriefing** (login → Extra WX → NOTAM search), which avoids FAA IP blocking. Set `NOTAM_SCRAPER=faa` to use the FAA NOTAM site instead (requires unblocked access).

---

## Step 1: Create the S3 bucket

1. In **AWS Console** go to **S3** → **Create bucket**.
2. **Bucket name:** e.g. `myapp-notams-prod` (must be globally unique).
3. **Region:** e.g. `us-east-1` (use the same region as EC2 and, if applicable, your app).
4. Leave **Block Public Access** enabled (the portal will use IAM to read).
5. Click **Create bucket**.

No bucket policy is required if you use IAM roles (recommended). The EC2 role will need write access; the portal (e.g. Vercel) will need read access via IAM user/role or env credentials.

---

## Step 2: IAM role for EC2 (scraper uploads to S3)

Create the policy **first**, then create the role and attach that policy (no “Create policy” button needed during role creation).

### 2a. Create the policy

1. In **AWS Console** go to **IAM** → **Policies** (left sidebar).
2. Click **Create policy**.
3. Open the **JSON** tab, delete the default text, and paste this (replace `myapp-notams-prod` with your bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::myapp-notams-prod/notams/*"
    }
  ]
}
```

4. Click **Next**.
5. **Policy name:** e.g. `NotamScraperS3Upload` → **Create policy**.

### 2b. Create the role and attach the policy

1. Go to **IAM** → **Roles** → **Create role**.
2. **Trusted entity type:** **AWS service**.
3. **Use case:** **EC2** → **Next**.
4. **Permissions:** In the search box type `NotamScraperS3Upload`, tick the checkbox next to your policy → **Next**.
5. **Role name:** e.g. `NotamScraperEC2Role` → **Create role**.

You’ll attach this role to the EC2 instance in Step 3.

---

## Step 3: Launch the EC2 instance

1. **EC2** → **Launch instance**.
2. **Name:** e.g. `notam-scraper`.
3. **AMI:** **Ubuntu Server 22.04 LTS**.
4. **Instance type:** **t3.small** (2 vCPU, 2 GB RAM; minimum recommended for Chrome + Xvfb).
5. **Key pair:** Create or select one so you can SSH.
6. **Network:** Default VPC and a public subnet (or your own); allow SSH (port 22) in the security group.
7. **IAM instance profile:** Scroll down or open **Advanced details** and set **IAM instance profile** to **NotamScraperEC2Role** (from Step 2). If you don’t see “Advanced details”, look for a **Summary** panel on the right—some consoles show instance profile there.
8. **User data (optional):** Some EC2 UIs show **User data** only when you expand **Advanced details** at the bottom of the page. If you **don’t see a User data field**, skip it—you’ll install everything manually after SSH in Step 4 (see **4b** below).
   - If you do see **User data**, paste this script so dependencies install on first boot:

```bash
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb unzip

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Google Chrome (recommended for FAA site)
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-key.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-key.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable

npm install -g npm@latest
```

9. Click **Launch instance**. Wait until the instance is **running** and note its **Public IP** (or use SSM Session Manager if you prefer).

---

## Step 4: Deploy the project on EC2

SSH into the instance (replace `your-key.pem` and `EC2-PUBLIC-IP`):

```bash
ssh -i your-key.pem ubuntu@EC2-PUBLIC-IP
```

### 4a. If you skipped User data in Step 3 – install dependencies now

Run this once on the EC2 instance (same as the User data script):

```bash
sudo bash -c 'export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y xvfb unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-key.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-key.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update && apt-get install -y google-chrome-stable
npm install -g npm@latest'
```

(If you already used User data, wait 2–3 minutes after first boot for it to finish, then continue below.)

### 4b. Clone the repo and install app dependencies

On the EC2 instance:

1. **Clone your repo** (or copy the project files):

```bash
cd ~
git clone https://github.com/YOUR-ORG/clearway-2.git
cd clearway-2
```

2. **Install dependencies** (including Playwright; we’ll use system Chrome, so no need to install Chromium):

```bash
npm install
# Do NOT run: npx playwright install chromium (we use system Chrome)
```

3. **Verify the scraper script exists:**

```bash
ls -la scripts/notam-scraper.mjs
```

The script uses `@aws-sdk/client-s3` and `playwright` from `node_modules`; with `CHROME_CHANNEL=chrome` it will use the system Chrome you installed in user data.

---

## Step 5: Run the scraper with Xvfb and S3 upload

On the EC2 instance, set your bucket, region, and (for CrewBriefing) credentials:

```bash
cd ~/clearway-2

export AWS_S3_BUCKET=myapp-notams-prod
export AWS_REGION=us-east-1
export USE_HEADED=1
export CHROME_CHANNEL=chrome

# Required for CrewBriefing (default scraper)
export CREWBRIEFING_USER=your-crewbriefing-username
export CREWBRIEFING_PASSWORD=your-crewbriefing-password
```

Run for one airport (e.g. DBBB). Use `xvfb-run` so Chrome has a virtual display:

**CrewBriefing (default):**
```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/crewbriefing-notams.mjs --json DBBB
```

**FAA (if you set NOTAM_SCRAPER=faa):**
```bash
export NOTAM_SCRAPER=faa
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/notam-scraper.mjs --json DBBB
```

- With `USE_HEADED=1`, the script runs Chrome in “headed” mode on display `:99` (provided by `xvfb-run`).
- With `AWS_S3_BUCKET` set, the script uploads to `s3://myapp-notams-prod/notams/DBBB.json`.

Check S3: in the bucket you should see `notams/DBBB.json`. If you see “Uploaded to s3://…” in the script output, it worked.

**Optional – different S3 prefix:**  
If you want a different folder than `notams/`, set:

```bash
export AWS_S3_PREFIX=my-notams
```

Then the object key will be `my-notams/DBBB.json`. The portal’s `AWS_NOTAMS_PREFIX` must match (see Step 6).

---

## Step 5b: Run the sync server on EC2 (live sync when user requests an ICAO)

So that **each time a user enters an ICAO in the portal**, the app triggers the scraper on EC2 and returns fresh data from the FAA:

1. On the EC2 instance, set env and start the sync server (same bucket and CrewBriefing credentials as in Step 5):

```bash
cd ~/clearway-2
export AWS_S3_BUCKET=myapp-notams-prod
export AWS_REGION=us-east-1
export CHROME_CHANNEL=chrome
export SYNC_SECRET=choose-a-long-random-secret-string
export CREWBRIEFING_USER=your-crewbriefing-username
export CREWBRIEFING_PASSWORD=your-crewbriefing-password
node scripts/notam-sync-server.mjs
```

The server listens on port **3001** (or set `NOTAM_SYNC_PORT`). By default it runs the **CrewBriefing** scraper (`scripts/crewbriefing-notams.mjs`). Set `NOTAM_SCRAPER=faa` to use the FAA scraper instead. It accepts `GET /sync?icao=XXXX`; when called, it runs the NOTAM scraper for that ICAO and returns the result (or 502 on failure).

2. **Keep it running:** use `tmux` or `screen`, or run as a systemd service. Example with `tmux`:

```bash
tmux new -s notam
cd ~/clearway-2
export AWS_S3_BUCKET=myapp-notams-prod AWS_REGION=us-east-1 CHROME_CHANNEL=chrome SYNC_SECRET=your-secret
node scripts/notam-sync-server.mjs
# Detach: Ctrl+B then D. Reattach: tmux attach -t notam
```

3. **Expose the server to the internet** so Vercel can call it: open port 3001 in the EC2 security group (Source: 0.0.0.0/0 or your Vercel IPs if you prefer). The sync URL will be `http://EC2-PUBLIC-IP:3001` (or use a domain + reverse proxy if you have one).

4. In **Vercel** (Step 6), add **NOTAM_SYNC_URL** and **NOTAM_SYNC_SECRET** so the portal triggers this server when the user requests NOTAMs.

---

## Step 6: Point the portal (Vercel) at S3 and live sync

So that `/api/notams?icao=DBBB` can trigger a live scrape and read from S3:

1. **Vercel** → your project → **Settings** → **Environment Variables**.
2. Add:
   - **Name:** `AWS_NOTAMS_BUCKET`  
     **Value:** `myapp-notams-prod` (same bucket as on EC2).
   - **Name:** `AWS_REGION`  
     **Value:** `us-east-1`
   - **Name:** `NOTAM_SYNC_URL`  
     **Value:** `http://EC2-PUBLIC-IP:3001` (the sync server from Step 5b; no trailing slash).
   - **Name:** `NOTAM_SYNC_SECRET`  
     **Value:** the same `SYNC_SECRET` you set when starting the sync server on EC2.
   - **Optional**, only if you changed the prefix on EC2:  
     **Name:** `AWS_NOTAMS_PREFIX`  
     **Value:** `notams` (or `my-notams` if you set `AWS_S3_PREFIX=my-notams`).

3. **Vercel needs read access to S3.** Use an IAM user and access keys (see **Step 6a** below). If your app runs on AWS (e.g. ECS/Lambda), you can attach a role with `s3:GetObject` instead and skip access keys.

4. **Redeploy** the app so the new env vars are applied.

---

### Step 6a: Create IAM user and access key (for Vercel)

Do this in the AWS Console so Vercel can read NOTAMs from your S3 bucket.

**If you already have a user:** IAM → **Users** → click the user name → **Security credentials** tab → **Access keys** → **Create access key** → choose “Application running outside AWS” or “CLI” → **Next** → **Create access key**, then copy the Access key ID and Secret access key into Vercel as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Make sure that user has a policy allowing `s3:GetObject` on `arn:aws:s3:::YOUR-BUCKET/notams/*` (attach the policy from step 3 below if not).

**To create a new user and key:**

1. **IAM** → **Users** → **Create user**.
2. **User name:** e.g. `vercel-notams-reader` → **Next**.
3. **Permissions:** Choose **Attach policies directly**. Click **Create policy** (opens new tab).
   - **JSON** tab, paste (replace `myapp-notams-prod` with your bucket name):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::myapp-notams-prod/notams/*"
       }
     ]
   }
   ```

   - **Next** → **Policy name:** e.g. `VercelNotamsReadOnly` → **Create policy**.
4. Back in the **Create user** tab: **Refresh** the policy list, search for **VercelNotamsReadOnly**, tick it → **Next** → **Create user**.
5. Open the new user → **Security credentials** tab → **Access keys** → **Create access key**.
6. **Use case:** “Application running outside AWS” or “Command Line Interface (CLI)” → **Next** → **Create access key**.
7. **Copy the Access key ID and Secret access key** (you won’t see the secret again). Add them in Vercel as:
   - **Name:** `AWS_ACCESS_KEY_ID` → **Value:** (the Access key ID).
   - **Name:** `AWS_SECRET_ACCESS_KEY` → **Value:** (the Secret access key).

Keep the secret safe and don’t commit it to git.

After that, when a user requests NOTAMs for an ICAO (e.g. DBBB), the portal calls the EC2 sync server (`NOTAM_SYNC_URL`), which runs the scraper and returns fresh data. If the sync server is unreachable, the API falls back to reading from S3 (cached data). The UI shows “Syncing live from FAA…” and “Last synced at …” when data was updated.

---

## Step 7: Automate the scraper (cron)

To refresh NOTAMs periodically, use cron on the EC2 instance.

1. SSH into EC2, then:

```bash
crontab -e
```

2. Add a line to run every 6 hours for one or more ICAOs (adjust path and bucket to match your setup). For CrewBriefing (default), set credentials:

```bash
0 */6 * * * cd /home/ubuntu/clearway-2 && AWS_S3_BUCKET=myapp-notams-prod AWS_REGION=us-east-1 USE_HEADED=1 CHROME_CHANNEL=chrome CREWBRIEFING_USER=xxx CREWBRIEFING_PASSWORD=xxx xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/crewbriefing-notams.mjs --json DBBB >> /var/log/notam.log 2>&1
```

For multiple airports, either add more lines (one per ICAO) or a small wrapper script that loops over ICAOs and calls the scraper for each.

Example wrapper `~/clearway-2/scripts/run-notams.sh` (CrewBriefing):

```bash
#!/bin/bash
cd /home/ubuntu/clearway-2
export AWS_S3_BUCKET=myapp-notams-prod AWS_REGION=us-east-1 USE_HEADED=1 CHROME_CHANNEL=chrome CREWBRIEFING_USER=xxx CREWBRIEFING_PASSWORD=xxx
for icao in DBBB KJFK EGLL; do
  xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/crewbriefing-notams.mjs --json "$icao" >> /var/log/notam.log 2>&1
  sleep 10
done
```

Then in crontab:

```bash
0 */6 * * * /home/ubuntu/clearway-2/scripts/run-notams.sh
```

---

## Step 8: Troubleshooting

### Instance status check failed / Can’t SSH / NOTAM server not responding

If the EC2 instance shows **2/3 checks passed** or **Instance status check failed** and you can’t SSH in, the OS is likely hung (e.g. OOM, disk full, or kernel issue). Do this **from the AWS Console** (no SSH needed):

1. **See why it failed**  
   EC2 → select **notam-scraper** → **Actions** → **Monitor and troubleshoot** → **Get system log** and **Get instance screenshot**.  
   - **System log**: look for `Out of memory`, `Killed process`, or disk errors.  
   - **Screenshot**: shows the last console frame (e.g. kernel panic or login prompt).

2. **Reboot the instance**  
   EC2 → select **notam-scraper** → **Instance state** → **Reboot instance**.  
   Wait 2–3 minutes, then try SSH again. The **public IP may change** if you don’t use an Elastic IP.

3. **After SSH works again**  
   - Restart the NOTAM sync server (it does not survive reboot unless you use systemd):
     ```bash
     ssh -i your-key.pem ubuntu@NEW-PUBLIC-IP
     cd ~/clearway-2
     export AWS_S3_BUCKET=your-bucket AWS_REGION=us-east-1 CHROME_CHANNEL=chrome SYNC_SECRET=your-secret CREWBRIEFING_USER=xxx CREWBRIEFING_PASSWORD=xxx
     tmux new -s notam
     node scripts/notam-sync-server.mjs
     # Detach: Ctrl+B then D
     ```
   - If the **public IP changed**, update **NOTAM_SYNC_URL** in Vercel to `http://NEW-PUBLIC-IP:3001` and redeploy.

4. **If reboot doesn’t fix it**  
   Launch a **new** EC2 instance (same AMI, instance type, key pair, IAM role, security group). Copy over the project (clone repo, set env, install deps), start the sync server, then update **NOTAM_SYNC_URL** in Vercel. Optionally attach an **Elastic IP** to the new instance so the IP doesn’t change on reboot.

5. **Reduce future failures**  
   - Use at least **t3.small** (2 GB RAM); Chrome + Xvfb can use ~1.5 GB.  
   - Add log rotation for scraper/cron logs so disk doesn’t fill.  
   - Consider running the sync server under **systemd** so it restarts on reboot (see Step 5b for manual start).

---

### S3 bucket is empty

The scraper only uploads when (1) it runs to the end without crashing, and (2) `AWS_S3_BUCKET` is set in the same shell where you run it. Check the following:

1. **Run the full command from Step 5** (from `~/clearway-2`), with your real bucket name:
   ```bash
   cd ~/clearway-2
   export AWS_S3_BUCKET=your-bucket-name
   export AWS_REGION=us-east-1
   export USE_HEADED=1
   export CHROME_CHANNEL=chrome
   xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/notam-scraper.mjs --json DBBB
   ```
2. **In the output, look for:** `Uploaded to s3://your-bucket-name/notams/DBBB.json`. If you see that, the file is in S3.
3. **Where to look in S3:** In the AWS Console, open your bucket. Objects are under the **prefix** `notams/` (it may appear as a “folder” named `notams`). Open it and look for `DBBB.json`. The bucket root can look “empty” if you don’t open the `notams/` prefix.
4. **If you see “S3 upload failed: …”** in the output, the EC2 instance role likely doesn’t have `s3:PutObject` on that bucket. Attach the **NotamScraperEC2Role** (Step 2) to the instance, or fix the policy.
5. **If the script crashes before the upload** (e.g. FAA error, Chrome not found), fix that first; the upload step only runs after a successful scrape.

### Sync button returns old data or “Sync server unreachable”

When you press **Sync**, the portal calls your EC2 sync server to run a fresh scrape. If you see old data or an error, check the following.

**On EC2:**

1. **Sync server is running** – SSH into EC2 and run (or reattach to tmux/screen):
   ```bash
   cd ~/clearway-2
   export AWS_S3_BUCKET=your-bucket AWS_REGION=us-east-1 CHROME_CHANNEL=chrome SYNC_SECRET=your-secret
   node scripts/notam-sync-server.mjs
   ```
   You should see: `NOTAM sync server listening on port 3001 | scraper: scripts/crewbriefing-notams.mjs`. Set `CREWBRIEFING_USER` and `CREWBRIEFING_PASSWORD` in the same shell so the scraper can log in.

2. **Port 3001 is open** – In EC2 → Security groups → your instance’s group → Inbound rules: allow **TCP 3001** from **0.0.0.0/0** (or your Vercel region IPs if you prefer).

3. **Test from EC2** – On the instance run:
   ```bash
   curl -s "http://localhost:3001/sync?icao=DBBB"
   ```
   If that works, the server is fine; the issue is reachability from the internet (security group or wrong NOTAM_SYNC_URL).

**On Vercel:**

4. **NOTAM_SYNC_URL** – Must be exactly your EC2 public URL, e.g. `http://3.84.12.34:3001` (no trailing slash). If you restarted EC2 and the public IP changed, update this.

5. **NOTAM_SYNC_SECRET** – If you set `SYNC_SECRET` on EC2, set the same value as `NOTAM_SYNC_SECRET` in Vercel.

After changing anything, redeploy the Vercel app so env vars are applied. When sync is configured correctly, pressing Sync runs the scraper on EC2 and returns fresh data; if something is wrong, the portal now shows a clear error instead of returning cached data.

---

| Problem | What to check |
|--------|----------------|
| **FAA “Access Denied”** | Use CrewBriefing (default): set `CREWBRIEFING_USER` and `CREWBRIEFING_PASSWORD`. Or run FAA with `USE_HEADED=1` and `xvfb-run`; if it still blocks, try another region or set `NOTAM_SCRAPER=crewbriefing`. |
| **CrewBriefing login failed** | Ensure `CREWBRIEFING_USER` and `CREWBRIEFING_PASSWORD` are set on EC2 (and in the same env as the sync server). |
| **S3 upload fails (access denied)** | EC2 instance profile must be **NotamScraperEC2Role** with `s3:PutObject` (and optionally `s3:GetObject`) on `arn:aws:s3:::BUCKET/notams/*`. No need for `AWS_ACCESS_KEY_ID` on EC2 if using the role. |
| **Portal returns no NOTAMs** | 1) Set `AWS_NOTAMS_BUCKET` (and optionally `AWS_NOTAMS_PREFIX`) in Vercel. 2) Ensure the object exists: `s3://BUCKET/notams/ICAO.json`. 3) Run the scraper once for that ICAo on EC2. 4) If using keys, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in Vercel and ensure that IAM user can `s3:GetObject` on that prefix. |
| **Chrome not found** | Install Chrome (Step 3 user data or manually) and set `CHROME_CHANNEL=chrome`. Or install Chromium: `apt-get install -y chromium-browser` and remove `CHROME_CHANNEL` so Playwright uses Chromium. |
| **Script timeout** | Default timeout is 90s in the API; the standalone script has its own timeouts. For slow runs, run only on EC2 and rely on S3; don’t trigger the scraper from the portal. |

---

## Quick reference – environment variables

**On EC2 (scraper):**

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `AWS_S3_BUCKET` | Yes (for upload) | `myapp-notams-prod` | Bucket where NOTAM JSON is stored. |
| `AWS_REGION` | No | `us-east-1` | Default `us-east-1`. |
| `AWS_S3_PREFIX` | No | `notams` | Key prefix; default `notams` → `notams/ICAO.json`. |
| `USE_HEADED` | Recommended | `1` | Run Chrome with virtual display (use with Xvfb). |
| `CHROME_CHANNEL` | No | `chrome` | Use system Chrome instead of Playwright Chromium. |
| `CREWBRIEFING_USER` | Yes (CrewBriefing) | (username) | CrewBriefing login (default scraper). |
| `CREWBRIEFING_PASSWORD` | Yes (CrewBriefing) | (password) | CrewBriefing password. |
| `NOTAM_SCRAPER` | No | `crewbriefing` | `crewbriefing` (default) or `faa`. |

**On EC2 (sync server only):**

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `SYNC_SECRET` | Recommended | (long random string) | Secret for `/sync`; Vercel sends it in `X-Sync-Secret`. |
| `NOTAM_SYNC_PORT` | No | `3001` | Port the sync server listens on (default 3001). |
| `CREWBRIEFING_USER` / `CREWBRIEFING_PASSWORD` | Yes (if using CrewBriefing) | (same as scraper) | Passed through to the scraper when sync runs. |

**On Vercel / Next.js (portal):**

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `AWS_NOTAMS_BUCKET` | Yes (to use S3) | `myapp-notams-prod` | Same bucket as scraper. |
| `AWS_REGION` | No | `us-east-1` | Must match bucket region. |
| `NOTAM_SYNC_URL` | For live sync | `http://EC2-IP:3001` | Base URL of EC2 sync server (no trailing slash). |
| `NOTAM_SYNC_SECRET` | If SYNC_SECRET set on EC2 | (same as SYNC_SECRET) | Sent as `X-Sync-Secret` when calling sync. |
| `AWS_NOTAMS_PREFIX` | No | `notams` | Must match `AWS_S3_PREFIX` if you changed it. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | If not using IAM role | (from IAM user) | Needed for Vercel to read from S3 (fallback). |

When `NOTAM_SYNC_URL` is set, each request for NOTAMs (e.g. user enters DBBB) triggers the scraper on EC2 and returns fresh data. If sync fails, the API falls back to reading from S3.
