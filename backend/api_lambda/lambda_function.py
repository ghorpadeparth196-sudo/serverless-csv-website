"""
API Lambda starter for API Gateway HTTP API (Python 3.12).

Routes:
  POST /upload-url
  GET  /status?reportKey=processed/<name>.summary.json

Environment variables:
  INPUT_BUCKET = existing input bucket name
  OUTPUT_BUCKET = existing output bucket name
  ALLOWED_ORIGIN = exact deployed website origin, e.g. https://main.xxxxx.amplifyapp.com

Important:
- This API is a starter. Confirm the report naming convention in your existing processor.
- Keep API Gateway authorization enabled before public production use.
- Restrict upload URLs to CSV, a small maximum file size, and short expiry.
"""
import json
import os
import re
import uuid
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
INPUT_BUCKET = os.environ["INPUT_BUCKET"]
OUTPUT_BUCKET = os.environ["OUTPUT_BUCKET"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "")

def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "content-type,authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Vary": "Origin",
        },
        "body": json.dumps(body),
    }

def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")
    if method == "OPTIONS":
        return response(204, {})
    if method == "POST" and path.endswith("/upload-url"):
        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return response(400, {"error": "Request body must be JSON."})
        filename = os.path.basename(str(body.get("fileName", ""))).strip()
        if not filename.lower().endswith(".csv") or len(filename) > 120:
            return response(400, {"error": "Only CSV filenames up to 120 characters are accepted."})
        content_type = body.get("contentType", "text/csv")
        if content_type not in ("text/csv", "application/vnd.ms-excel", "application/octet-stream"):
            return response(400, {"error": "Unsupported content type."})
        # UUID prefix prevents collisions and makes uploaded object names predictable.
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
        object_key = f"uploads/{uuid.uuid4().hex}-{safe_name}"
        # Existing processor's report naming must be aligned with this report key.
        report_key = f"processed/{object_key.split('/')[-1]}.summary.json"
        params = {"Bucket": INPUT_BUCKET, "Key": object_key, "ContentType": content_type}
        upload_url = s3.generate_presigned_url("put_object", Params=params, ExpiresIn=300)
        return response(200, {"uploadUrl": upload_url, "objectKey": object_key, "reportKey": report_key, "expiresIn": 300})
    if method == "GET" and path.endswith("/status"):
        params = event.get("queryStringParameters") or {}
        report_key = params.get("reportKey", "")
        # Accept only our expected report-key shape. Never accept arbitrary S3 keys.
        if not re.fullmatch(r"processed/[A-Za-z0-9._-]{1,180}\.csv\.summary\.json", report_key):
            return response(400, {"error": "Invalid reportKey."})
        try:
            obj = s3.get_object(Bucket=OUTPUT_BUCKET, Key=report_key)
            raw = obj["Body"].read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                return response(413, {"error": "Report is too large."})
            return response(200, {"status": "complete", "report": json.loads(raw.decode("utf-8"))})
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404", "NotFound"):
                return response(200, {"status": "processing"})
            raise
    return response(404, {"error": "Route not found."})
