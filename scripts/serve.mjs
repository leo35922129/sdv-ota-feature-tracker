#!/usr/bin/env node
/**
 * Static file server + small local API for feature edits / image uploads.
 * GET  /*                 static files
 * GET  /api/feature-edits
 * POST /api/feature-edits   { ids, title?, description?, categories?, image?, imageDark? }
 * POST /api/upload-image    { filename, mime, data (base64) }
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROOT,
  UPLOADS_DIR,
  loadEditsDoc,
  upsertEdits,
  validateAndSaveUpload,
  readImageDimensionsHint,
  MAX_IMAGE_DIMENSION,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "./feature-edits.mjs";
import { runMonitor, readMonitorStatus } from "./monitor.mjs";
import { handleAdminApi } from "./admin-api.mjs";
import { authMode } from "./admin-auth.mjs";

if (authMode() === "not-configured" && process.env.ADMIN_DEV_MOCK !== "0") {
  process.env.ADMIN_DEV_MOCK = "1";
}

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const MONITOR_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.MONITOR_INTERVAL_MS || 15 * 60 * 1000)
);
const MONITOR_DISABLED = process.env.MONITOR_DISABLED === "1";
mkdirSync(UPLOADS_DIR, { recursive: true });

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const limit = MAX_IMAGE_BYTES + 256 * 1024;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(req, res, urlPath) {
  const adminHandled = await handleAdminApi(req, res, urlPath, {
    readBody,
    sendJson,
  });
  if (adminHandled !== false) return true;

  if (urlPath === "/api/feature-edits" && req.method === "GET") {
    return sendJson(res, 200, loadEditsDoc());
  }

  if (urlPath === "/api/feature-edits" && req.method === "POST") {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    const brand = payload.brand === "rivian" ? "rivian" : "tesla";
    const result = upsertEdits(payload, { brand });
    if (!result.ok) {
      return sendJson(res, 400, {
        ok: false,
        errors: result.validation.errors,
        warnings: result.validation.warnings,
      });
    }
    try {
      const { defaultHistoryStore } = await import("./dev-history.mjs");
      const ids = (result.edits || []).map((row) => row.id).filter(Boolean);
      defaultHistoryStore.recordEvent({
        actorType: "user",
        actorName: "local editor",
        source: "user",
        actionType: "design_edit",
        title: "Feature card edit",
        summary: ids.length
          ? `Updated overlay for ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? "…" : ""}.`
          : "Updated the feature-edit overlay.",
        changedAreas: ["data/feature-edits.json"],
        snapshot: result.doc,
      });
    } catch {
      /* history is best-effort and must not block a valid edit */
    }
    return sendJson(res, 200, {
      ok: true,
      edits: result.edits,
      warnings: result.validation.warnings,
    });
  }

  if (urlPath === "/api/upload-image" && req.method === "POST") {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    const mime = String(payload.mime || "");
    const filename = String(payload.filename || "image");
    const data = String(payload.data || "");
    if (!ALLOWED_IMAGE_TYPES.has(mime)) {
      return sendJson(res, 400, {
        ok: false,
        errors: [
          `Unsupported type. Allowed: ${[...ALLOWED_IMAGE_TYPES].join(", ")}`,
        ],
      });
    }
    let buffer;
    try {
      const b64 = data.includes(",") ? data.split(",").pop() : data;
      buffer = Buffer.from(b64, "base64");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid base64 image data"] });
    }
    const saved = validateAndSaveUpload({ filename, mime, buffer });
    if (!saved.ok) return sendJson(res, 400, saved);

    const dims = readImageDimensionsHint(buffer, mime);
    if (
      dims &&
      (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)
    ) {
      return sendJson(res, 400, {
        ok: false,
        errors: [
          `Image dimensions ${dims.width}×${dims.height} exceed ${MAX_IMAGE_DIMENSION}px limit`,
        ],
      });
    }

    return sendJson(res, 200, {
      ok: true,
      url: saved.url,
      bytes: saved.bytes,
      mime: saved.mime,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    });
  }

  if (urlPath === "/api/monitor-status" && req.method === "GET") {
    return sendJson(res, 200, monitorStatusPayload());
  }

  if (urlPath === "/api/monitor" && req.method === "POST") {
    if (MONITOR_DISABLED) {
      return sendJson(res, 400, {
        ok: false,
        errors: ["Source monitor is disabled"],
      });
    }
    if (monitorJob.running) {
      return sendJson(res, 202, {
        ok: true,
        running: true,
        message: "Source check already in progress",
      });
    }
    tickMonitor();
    return sendJson(res, 202, {
      ok: true,
      running: true,
      message: "Checking Tesla and Rivian sources",
    });
  }

  if (urlPath.startsWith("/api/")) {
    return sendJson(res, 404, { ok: false, errors: ["Unknown API route"] });
  }
  return false;
}

const monitorJob = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastStatus: readMonitorStatus(),
};

function monitorStatusPayload() {
  return {
    ok: true,
    running: monitorJob.running,
    intervalMs: MONITOR_INTERVAL_MS,
    disabled: MONITOR_DISABLED,
    lastStartedAt: monitorJob.lastStartedAt,
    lastFinishedAt: monitorJob.lastFinishedAt,
    lastError: monitorJob.lastError,
    checkedAt: monitorJob.lastStatus?.checkedAt ?? null,
    results: monitorJob.lastStatus?.results ?? null,
    summary: monitorJob.lastStatus?.summary ?? [],
  };
}

async function tickMonitor() {
  if (MONITOR_DISABLED || monitorJob.running) return;
  monitorJob.running = true;
  monitorJob.lastStartedAt = new Date().toISOString();
  monitorJob.lastError = null;
  try {
    monitorJob.lastStatus = await runMonitor();
  } catch (err) {
    monitorJob.lastError = err.message || String(err);
    console.error("[monitor] loop failed:", monitorJob.lastError);
  } finally {
    monitorJob.running = false;
    monitorJob.lastFinishedAt = new Date().toISOString();
  }
}

function startMonitorLoop() {
  if (MONITOR_DISABLED) {
    console.log("Source monitor disabled (MONITOR_DISABLED=1)");
    return;
  }
  const minutes = Math.round(MONITOR_INTERVAL_MS / 60000);
  console.log(
    `Watching Tesla + Rivian OTA sources every ${minutes} min`
  );
  tickMonitor();
  setInterval(tickMonitor, MONITOR_INTERVAL_MS);
}

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

    if (urlPath.startsWith("/api/")) {
      const handled = await handleApi(req, res, urlPath);
      if (handled !== false) return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method not allowed");
      return;
    }

    let rel = urlPath === "/" ? "/index.html" : urlPath;
    if (rel === "/data/admin" || rel.startsWith("/data/admin/")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const body = readFileSync(file);
    const ext = extname(file);
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
    };
    if (ext === ".json" || ext === ".js" || ext === ".mjs" || ext === ".css" || ext === ".html") {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, errors: [err.message || "Server error"] });
    }
  }
}).listen(port, host, () => {
  console.log(`Open http://${host}:${port}`);
  console.log(`API: POST /api/feature-edits , POST /api/upload-image , /api/admin/*`);
  startMonitorLoop();
});
