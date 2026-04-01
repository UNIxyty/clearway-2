#!/usr/bin/env python3
"""
Run Amazon Textract on a PDF stored in S3 and save output JSON to S3.

This script includes preflight checks to catch common setup errors:
- wrong region
- missing object key
- bucket/object mismatch
- Textract endpoint not reachable in chosen region
"""

from __future__ import annotations

import argparse
import json
import os
import time

import boto3
from botocore.exceptions import ClientError, EndpointConnectionError


def normalize_region(location_constraint: str | None) -> str:
    # S3 returns None for us-east-1.
    return "us-east-1" if location_constraint in (None, "") else location_constraint


def get_bucket_region(s3_client: boto3.client, bucket: str) -> str:
    resp = s3_client.get_bucket_location(Bucket=bucket)
    return normalize_region(resp.get("LocationConstraint"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze a PDF from S3 with Textract and save JSON to S3."
    )
    parser.add_argument(
        "--region",
        default=os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1",
        help="AWS region for Textract and S3 operations.",
    )
    parser.add_argument(
        "--in-bucket",
        default=os.getenv("IN_BUCKET"),
        required=os.getenv("IN_BUCKET") is None,
        help="Input S3 bucket containing the PDF.",
    )
    parser.add_argument(
        "--out-bucket",
        default=os.getenv("OUT_BUCKET"),
        required=os.getenv("OUT_BUCKET") is None,
        help="Output S3 bucket for result JSON.",
    )
    parser.add_argument(
        "--pdf-key",
        default=os.getenv("PDF_KEY"),
        required=os.getenv("PDF_KEY") is None,
        help="S3 key of input PDF in input bucket.",
    )
    parser.add_argument(
        "--out-key",
        default=os.getenv("OUT_KEY") or "textract-output.json",
        help="S3 key for output JSON in output bucket.",
    )
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=2.0,
        help="Polling interval while waiting for Textract job completion.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    region = args.region

    s3 = boto3.client("s3", region_name=region)
    textract = boto3.client("textract", region_name=region)

    # Preflight 1: key should not be empty.
    if not args.pdf_key or not args.pdf_key.strip():
        raise SystemExit(
            "ERROR: --pdf-key is empty. Set PDF_KEY env var or pass --pdf-key explicitly."
        )

    # Preflight 2: bucket region must match requested region.
    in_bucket_region = get_bucket_region(s3, args.in_bucket)
    out_bucket_region = get_bucket_region(s3, args.out_bucket)
    if in_bucket_region != region:
        raise SystemExit(
            "ERROR: Input bucket region mismatch.\n"
            f"  input bucket region: {in_bucket_region}\n"
            f"  script region:       {region}\n"
            "Use the same region for Textract and both S3 buckets."
        )
    if out_bucket_region != region:
        raise SystemExit(
            "ERROR: Output bucket region mismatch.\n"
            f"  output bucket region: {out_bucket_region}\n"
            f"  script region:        {region}\n"
            "Use the same region for Textract and both S3 buckets."
        )

    # Preflight 3: ensure object exists and is readable.
    try:
        s3.head_object(Bucket=args.in_bucket, Key=args.pdf_key)
    except ClientError as exc:
        raise SystemExit(
            "ERROR: Cannot read input object.\n"
            f"  bucket: {args.in_bucket}\n"
            f"  key:    {args.pdf_key}\n"
            "Check key spelling/case, region, and s3:GetObject permission."
        ) from exc

    # Start Textract.
    try:
        start = textract.start_document_analysis(
            DocumentLocation={
                "S3Object": {"Bucket": args.in_bucket, "Name": args.pdf_key}
            },
            FeatureTypes=["TABLES", "FORMS"],
        )
    except EndpointConnectionError as exc:
        raise SystemExit(
            "ERROR: Cannot reach Textract endpoint in this region.\n"
            f"  region: {region}\n"
            "Try a region where Textract is available to your account/network (e.g. us-east-1 or eu-west-1)."
        ) from exc
    except ClientError as exc:
        raise SystemExit(
            "ERROR: Textract start_document_analysis failed.\n"
            f"Details: {exc}"
        ) from exc

    job_id = start["JobId"]
    print("JobId:", job_id)

    # Wait for completion.
    while True:
        resp = textract.get_document_analysis(JobId=job_id, MaxResults=1000)
        status = resp["JobStatus"]
        print("Status:", status)
        if status in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
            break
        time.sleep(args.poll_seconds)

    if status not in ("SUCCEEDED", "PARTIAL_SUCCESS"):
        raise SystemExit(f"ERROR: Textract job ended with status {status}")

    # Collect all paginated blocks.
    blocks = []
    next_token = None
    document_metadata = {}
    while True:
        if next_token:
            resp = textract.get_document_analysis(
                JobId=job_id, MaxResults=1000, NextToken=next_token
            )
        else:
            resp = textract.get_document_analysis(JobId=job_id, MaxResults=1000)

        blocks.extend(resp.get("Blocks", []))
        document_metadata = resp.get("DocumentMetadata", document_metadata)
        next_token = resp.get("NextToken")
        if not next_token:
            break

    output = {
        "job_id": job_id,
        "status": status,
        "region": region,
        "input_bucket": args.in_bucket,
        "input_key": args.pdf_key,
        "document_metadata": document_metadata,
        "blocks_count": len(blocks),
        "blocks": blocks,
    }

    body = json.dumps(output, ensure_ascii=False).encode("utf-8")
    s3.put_object(
        Bucket=args.out_bucket,
        Key=args.out_key,
        Body=body,
        ContentType="application/json",
    )

    print(f"Saved to s3://{args.out_bucket}/{args.out_key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
