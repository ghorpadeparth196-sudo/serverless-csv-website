# AWS Deployment Guide (read before changing AWS)

This guide is deliberately incremental. The local site works in demo mode first. Do not change the existing `serverless-csv-processor` until you have inspected its report naming logic.

## Step 1 — Run locally
From the extracted folder:
```powershell
cd frontend
python -m http.server 5500
```
Open http://localhost:5500. Choose `../samples/students.csv` (copy it into an easy location if the browser file picker makes navigation awkward). Demo mode calculates the summary locally; it does not contact AWS.

## Step 2 — Inspect the existing processor output key
In AWS Lambda, open `serverless-csv-processor` and inspect the code that creates the output key. The previous project setup used a key like `processed/{basename}.summary.json`. Confirm this exact behavior. The API Lambda currently expects `processed/{uploaded-object-filename}.summary.json`. If your processor strips prefixes, changes names, or uses a different format, update `report_key` generation in the API Lambda and the status validation regex accordingly before deploying.

The upload API creates keys such as `uploads/<uuid>-students.csv`. The S3 event should still trigger because the suffix is `.csv`. Ensure the existing processor correctly decodes S3 event keys and handles the `uploads/` prefix.

## Step 3 — Create a separate API Lambda
Do not replace your existing CSV processor.
1. AWS Lambda → Create function → Author from scratch.
2. Name: `serverless-csv-website-api`
3. Runtime: Python 3.12; architecture x86_64.
4. Paste `backend/api_lambda/lambda_function.py`.
5. Add environment variables:
   - `INPUT_BUCKET` = `serverless-csv-input-2026-7737`
   - `OUTPUT_BUCKET` = `serverless-csv-output-2026-7737-420873873260-ap-southeast-2-an`
   - `ALLOWED_ORIGIN` = set later, after hosting is deployed.
6. Execution role permissions:
   - `s3:PutObject` on `arn:aws:s3:::serverless-csv-input-2026-7737/uploads/*` is not enough for presigned URL generation by itself in all policy designs; the signer needs permission to perform `s3:PutObject` on that prefix.
   - `s3:GetObject` on `arn:aws:s3:::serverless-csv-output-2026-7737-420873873260-ap-southeast-2-an/processed/*`
   - Basic CloudWatch logging permissions.
7. The API Lambda does not need to read input CSV contents. It only signs upload URLs and reads reports.

## Step 4 — Create API Gateway HTTP API
1. API Gateway → Create API → HTTP API.
2. Add integration to `serverless-csv-website-api`.
3. Create routes:
   - `POST /upload-url`
   - `GET /status`
4. Enable CORS for your exact Amplify website origin (not `*` for an authenticated production app), methods GET, POST, OPTIONS, and headers content-type, authorization.
5. Deploy to a stage (for example `prod`) and copy the invoke URL.
6. Test API routes only after Lambda environment variables and IAM permissions are correct.

## Step 5 — Connect the frontend
Edit `frontend/config.js`:
```js
window.APP_CONFIG = {
  API_BASE_URL: "https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com/prod"
};
```
Use the exact API Gateway invoke URL. Do not add a trailing slash.

## Step 6 — Host the frontend
Recommended: use AWS Amplify Hosting with a Git repository.
1. Create a private GitHub repository and push this project.
2. In AWS Amplify → Host web app, connect the repository and deploy the `frontend` directory as a static website (if the console requires a build setup, use a static hosting configuration appropriate to the repository; no framework build is needed).
3. Copy the Amplify HTTPS domain.
4. Set API Lambda `ALLOWED_ORIGIN` to that exact origin, e.g. `https://main.xxxxx.amplifyapp.com`.
5. Set matching API Gateway CORS origin and redeploy/update configuration.

## Security checklist before making the site public
- Add authentication (for example Amazon Cognito) before allowing public uploads or report access. The starter is not production-ready as an unauthenticated public service.
- Keep presigned URL expiry short (currently 5 minutes).
- Add an API-side upload size strategy; presigned PUT alone does not enforce the browser's 10 MB check against a malicious client. For strict enforcement, use a presigned POST policy with `content-length-range`, or another controlled upload path.
- Restrict bucket CORS to your exact website origin and needed methods/headers.
- Use separate least-privilege permissions; do not embed AWS access keys in frontend code.
- Configure throttling/quotas, CloudWatch alarms, S3 lifecycle cleanup, and a billing alert.
- The API route validates the report key, but you must add authentication and per-user authorization before production.
- The API Lambda report-key convention must match the existing processor. Verify this before live mode.
- Test with a non-sensitive CSV first.
