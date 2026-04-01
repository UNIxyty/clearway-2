# AWS PDF to JSON Tutorial (Step-by-Step)

This guide shows how to convert PDF files to JSON using AWS services.

Pipeline:

1. Upload PDF to S3
2. Run Amazon Textract
3. Save/download structured JSON
4. (Optional) Use Bedrock to map to custom schema (e.g., AIP AD sections)

---

## 1) Prerequisites

- AWS account
- AWS CLI installed
- Python 3.10+
- `boto3` installed

Install dependencies:

```bash
python3 -m pip install boto3
```

---

## 2) Create AWS account and sign in

1. Go to [https://aws.amazon.com](https://aws.amazon.com)
2. Click **Create an AWS Account**
3. Complete signup and billing
4. Log in to AWS Console

---

## 3) Choose one AWS Region

In top-right corner of AWS Console, pick a single region and keep it consistent everywhere.

Use one region for both:

- Textract API calls
- input S3 bucket
- output S3 bucket

Recommended starter regions:

- `us-east-1`
- `eu-west-1`

Example used in this guide: `eu-west-1`

---

## 4) Create IAM user for CLI access

1. Open **IAM**
2. Left menu -> **Users**
3. Click **Create user**
4. Name: `clearway-textract-user`
5. Click **Next**
6. Select **Attach policies directly**
7. Attach:
  - `AmazonTextractFullAccess`
  - `AmazonS3FullAccess`
8. Click **Create user**

Create access keys:

1. Open that user
2. Tab: **Security credentials**
3. Section: **Access keys** -> **Create access key**
4. Use case: **Command Line Interface (CLI)**
5. Copy and save:
  - Access Key ID
  - Secret Access Key

---

## 5) Install and configure AWS CLI

Install (macOS):

```bash
brew install awscli
aws --version
```

Configure:

```bash
aws configure
```

Enter:

- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1` (or your chosen region)
- Output format: `json`

Verify:

```bash
aws sts get-caller-identity
```

---

## 6) Create S3 input/output buckets

Pick globally unique bucket names:

```bash
export AWS_REGION=eu-west-1
export IN_BUCKET=clearway-aip-in-$(date +%s)-$RANDOM
export OUT_BUCKET=clearway-aip-out-$(date +%s)-$RANDOM

aws s3 mb s3://$IN_BUCKET --region $AWS_REGION
aws s3 mb s3://$OUT_BUCKET --region $AWS_REGION
```

Upload a PDF:

```bash
aws s3 cp "/Users/whae/Downloads/Clearway/AIP's/andorra_aip.pdf" s3://$IN_BUCKET/
aws s3 ls s3://$IN_BUCKET
```

Sanity check both bucket regions:

```bash
aws s3api get-bucket-location --bucket "$IN_BUCKET"
aws s3api get-bucket-location --bucket "$OUT_BUCKET"
```

---

## 7) Create Python script to run Textract

Create file: `aws_textract_to_json.py`

Use the hardened script already in your project root: `aws_textract_to_json.py`.

It validates:

- empty key
- bucket region mismatch
- missing object
- Textract endpoint/region issues

---

## 8) Run extraction and download JSON

Set runtime variables:

```bash
export AWS_REGION=eu-west-1
export PDF_KEY=andorra_aip.pdf
```

Run:

```bash
python3 aws_textract_to_json.py \
  --region "$AWS_REGION" \
  --in-bucket "$IN_BUCKET" \
  --out-bucket "$OUT_BUCKET" \
  --pdf-key "$PDF_KEY" \
  --out-key "andorra_aip.textract.json"
```

Download output:

```bash
aws s3 cp s3://$OUT_BUCKET/andorra_aip.textract.json .
```

---

## 9) Validate output quickly

Optional: install `jq`

```bash
brew install jq
```

Quick checks:

```bash
jq '.status, .document_metadata, .blocks_count' andorra_aip.textract.json
jq '[.blocks[] | select(.BlockType=="TABLE")] | length' andorra_aip.textract.json
jq '[.blocks[] | select(.BlockType=="LINE")] | length' andorra_aip.textract.json
```

---

## 10) Optional: map Textract JSON to your custom schema

Textract gives rich raw structure (`LINE`, `WORD`, `TABLE`, `CELL`, key-value blocks).

To output custom structure (like `AD_2_2`, `AD_2_3`):

- Option A: rule-based parser (regex + table mapping)
- Option B: Bedrock model call with strict JSON schema prompt

If using Bedrock:

1. Open **Amazon Bedr**
2. Go to **Model access**
3. Click **Manage model access**
4. Request access to a model
5. Use `bedrock:InvokeModel` from boto3

---

## 11) Common errors and fixes

- `AccessDeniedException`
  - Missing IAM permissions for Textract/S3.
- `InvalidS3ObjectException`
  - Most common causes:
    - bucket region != Textract region
    - wrong key (case-sensitive)
    - missing `s3:GetObject` permission
- `Could not connect to the endpoint URL`
  - Region endpoint unavailable from your environment/account.
  - Retry with `us-east-1` or `eu-west-1` and recreate both buckets there.
- No table/key-value extraction
  - Scan quality/layout issue; try better source PDF.
- Very large docs slow
  - Expected for async analysis; keep polling.

---

## 12) Cleanup (avoid extra costs)

```bash
aws s3 rb s3://$IN_BUCKET --force
aws s3 rb s3://$OUT_BUCKET --force
```

---

## Recommended Next Step for AIP Data

Use this two-stage approach:

1. Textract for robust OCR/layout JSON
2. Normalize to AIP schema (`ICAO`, `AD_2_2`, `AD_2_3`, etc.) with parser/LLM

