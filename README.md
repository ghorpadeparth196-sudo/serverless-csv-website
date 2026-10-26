# CloudCSV — Serverless CSV Processing Website

This starter project contains:
- A responsive website frontend (HTML, CSS, JavaScript)
- An AWS API Lambda starter for generating short-lived S3 upload URLs and checking report status
- Sample CSV files
- Step-by-step deployment notes

## Important
The website runs locally in **demo mode** immediately. Demo mode uses simulated results and does not upload to AWS.
To connect it to AWS, deploy the API Lambda and API Gateway, configure the environment variables/permissions described in `DEPLOY_AWS.md`, and set the API URL in `frontend/config.js`.

This project is designed to reuse your existing input bucket, output bucket, and `serverless-csv-processor` S3-triggered Lambda. It does not modify that processor.

## Run locally
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Open a terminal in the project folder.
4. Start a local static server (recommended):

   ```powershell
   cd frontend
   python -m http.server 5500
   ```

5. Open http://localhost:5500 in Chrome.

If `python` is not recognized, try `py -m http.server 5500`.

The page works in demo mode while `API_BASE_URL` in `frontend/config.js` is an empty string.

## Files
- `frontend/index.html` — website
- `frontend/styles.css` — styling
- `frontend/app.js` — upload/status/results logic
- `frontend/config.js` — API URL setting
- `backend/api_lambda/lambda_function.py` — API Lambda starter
- `DEPLOY_AWS.md` — AWS deployment guide
- `samples/` — example CSVs

## Current API contract
The frontend expects:
- `POST /upload-url` JSON `{ "fileName": "students.csv", "contentType": "text/csv" }`
  - returns `{ "uploadUrl": "...", "objectKey": "uploads/<uuid>-students.csv", "reportKey": "processed/<uuid>-students.csv.summary.json" }`
- Browser uploads the file to `uploadUrl` with HTTP PUT.
- `GET /status?reportKey=<encoded report key>`
  - returns `{ "status": "processing" }` or `{ "status": "complete", "report": { ... } }`

**Integration note:** the API Lambda below uses the expected report-key naming convention. Before enabling live mode, verify that your existing processor writes reports using the same convention. If it writes `processed/{basename}.summary.json`, update the API Lambda to derive exactly that key. Never expose arbitrary bucket/key access through an unauthenticated API.
