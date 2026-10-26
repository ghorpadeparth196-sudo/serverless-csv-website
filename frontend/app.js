(() => {
  const cfg = window.APP_CONFIG || { API_BASE_URL: "" };
  const apiBase = (cfg.API_BASE_URL || "").replace(/\/+$/, "");
  const isLive = Boolean(apiBase);
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const dropzone = $("dropzone");
  let selectedFile = null;
  let currentReport = null;
  let currentReportKey = null;
  $("modePill").textContent = isLive ? "AWS connected" : "Local demo mode";

  function notice(message, error = false) {
    $("notice").textContent = message;
    $("notice").classList.toggle("error", error);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function formatBytes(n) { return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`; }
  function selectFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      selectedFile = null; $("selectedFile").classList.add("hidden"); $("processBtn").disabled = true;
      notice("Please choose a file with a .csv extension.", true); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      selectedFile = null; $("selectedFile").classList.add("hidden"); $("processBtn").disabled = true;
      notice("This starter limits uploads to 10 MB. Choose a smaller CSV file.", true); return;
    }
    selectedFile = file;
    $("dropTitle").textContent = file.name;
    $("selectedFile").innerHTML = `<span class="file-icon">▤</span><span><strong>${escapeHtml(file.name)}</strong><br><span class="muted">${formatBytes(file.size)}</span></span>`;
    $("selectedFile").classList.remove("hidden"); $("processBtn").disabled = false;
    notice("File selected. Ready to process.");
  }
  function parseCsv(text) {
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false; else field += c;
      } else if (c === '"' && field.length === 0) quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(v => v.trim() !== "")) rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, "")); if (row.some(v => v.trim() !== "")) rows.push(row); }
    if (!rows.length) throw new Error("The CSV file is empty.");
    const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    const data = rows.slice(1); const counts = {};
    headers.forEach((h, i) => counts[h] = data.reduce((sum, r) => sum + (String(r[i] ?? "").trim() !== "" ? 1 : 0), 0));
    return { file_name: selectedFile.name, row_count: data.length, column_count: headers.length, columns: headers, non_empty_values: counts, note: "Calculated locally in demo mode." };
  }
  function setStatus(text, neutral = false) { $("statusPill").textContent = text; $("statusPill").className = neutral ? "pill neutral" : "pill"; }
  function showReport(report) {
    currentReport = report; $("emptyState").classList.add("hidden"); $("reportArea").classList.remove("hidden");
    $("rowCount").textContent = report.row_count ?? "—"; $("columnCount").textContent = report.column_count ?? "—";
    const counts = report.non_empty_values || report.non_empty_values_per_column || report.non_empty_values_by_column || {};
    $("columnList").innerHTML = Object.entries(counts).map(([name, count]) => `<div class="column-row"><strong>${escapeHtml(name)}</strong><span class="count-tag">${escapeHtml(count)}</span></div>`).join("") || '<div class="column-row">No column counts found in this report.</div>';
    $("rawJson").textContent = JSON.stringify(report, null, 2); setStatus("Report ready");
  }
  async function liveProcess(file) {
    const urlRes = await fetch(`${apiBase}/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: "text/csv" }) });
    if (!urlRes.ok) throw new Error(`Upload URL request failed (${urlRes.status}).`);
    const data = await urlRes.json(); if (!data.uploadUrl || !data.reportKey) throw new Error("API response is missing uploadUrl or reportKey.");
    const putRes = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/csv" }, body: file });
    if (!putRes.ok) throw new Error(`S3 upload failed (${putRes.status}). Check S3 CORS and the presigned URL configuration.`);
    currentReportKey = data.reportKey; setStatus("Processing…"); notice("Uploaded to S3. Waiting for the Lambda report…");
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${apiBase}/status?reportKey=${encodeURIComponent(currentReportKey)}`);
      if (!statusRes.ok) throw new Error(`Status request failed (${statusRes.status}).`);
      const statusData = await statusRes.json();
      if (statusData.status === "complete" && statusData.report) { showReport(statusData.report); notice("Processing complete. Your JSON report is ready."); return; }
      notice(`File uploaded. Checking processing status… (${i + 1}/30)`);
    }
    throw new Error("The report is not ready yet. Check the output bucket and CloudWatch logs, then try checking status again.");
  }
  $("processBtn").addEventListener("click", async () => {
    if (!selectedFile) return; $("processBtn").disabled = true; $("processBtn").textContent = "Processing…"; setStatus("Processing…");
    try { if (isLive) await liveProcess(selectedFile); else { await new Promise(r => setTimeout(r, 650)); showReport(parseCsv(await selectedFile.text())); notice("Demo complete. Results were calculated in your browser; no AWS resources were contacted."); } }
    catch (err) { notice(err.message || "Something went wrong.", true); setStatus("Needs attention", true); }
    finally { $("processBtn").disabled = false; $("processBtn").innerHTML = 'Upload and process <span>↗</span>'; }
  });
  fileInput.addEventListener("change", e => selectFile(e.target.files[0]));
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => { e.preventDefault(); dropzone.classList.remove("dragover"); selectFile(e.dataTransfer.files[0]); });
  $("downloadBtn").addEventListener("click", () => { if (!currentReport) return; const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(selectedFile?.name || "report").replace(/\.csv$/i, "")}.summary.json`; a.click(); URL.revokeObjectURL(a.href); });
})();
