#!/usr/bin/env node
/**
 * Poll Tesla + Rivian OTA index pages for new versions and scrape only what's new.
 * Usage: node scripts/monitor.mjs
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listReleaseNoteVersions,
  mergeReleaseVersions,
} from "./scrape.mjs";

export const PARSER_VERSION = "ota-source-sync-v1";
export const MONITOR_LOCK_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  ".monitor.lock"
);

export function hashSourceHtml(html) {
  return createHash("sha256").update(String(html || ""), "utf8").digest("hex");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const STATUS = join(DATA, "monitor-status.json");
const NODE =
  process.execPath ||
  "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node";

const SOURCES = {
  tesla: {
    label: "Tesla",
    historyUrl: "https://www.notateslaapp.com/software-updates/history/",
    sitemapUrl: "https://www.notateslaapp.com/sitemap.xml",
    dataFile: join(DATA, "releases.json"),
    scrapeScript: join(ROOT, "scripts", "scrape.mjs"),
    listVersions(html) {
      const re =
        /https:\/\/www\.notateslaapp\.com\/software-updates\/version\/([^"\/]+)\/release-notes/g;
      const out = [];
      const seen = new Set();
      let m;
      while ((m = re.exec(html))) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          out.push(m[1]);
        }
      }
      return out;
    },
    knownVersions(data) {
      return new Set((data?.releases || []).map((r) => r.version));
    },
  },
  rivian: {
    label: "Rivian",
    historyUrl: "https://riviantrackr.com/updates/",
    secondaryHistoryUrl: "https://www.rivianwave.com/software-updates/history/",
    dataFile: join(DATA, "rivian-releases.json"),
    scrapeScript: join(ROOT, "scripts", "scrape-rivian.mjs"),
    listVersions(html) {
      const re =
        /href="(https:\/\/riviantrackr\.com\/(20\d{2}-[\d-]+)\/)"/g;
      const out = [];
      const seen = new Set();
      let m;
      while ((m = re.exec(html))) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          out.push(m[1]);
        }
      }
      return out;
    },
    listSecondaryVersions(html) {
      const re = /\/software-updates\/version\/([^"\/]+)\/release-notes/g;
      const out = [];
      const seen = new Set();
      let m;
      while ((m = re.exec(html))) {
        const v = decodeURIComponent(m[1]);
        if (!seen.has(v)) {
          seen.add(v);
          out.push(`wave:${v}`);
        }
      }
      return out;
    },
    knownVersions(data) {
      const set = new Set((data?.releases || []).map((r) => r.url || r.version));
      for (const v of data?.waveVersions || []) set.add(`wave:${v}`);
      for (const f of data?.features || []) {
        if (f.waveUrl) set.add(`wave:${f.version}`);
      }
      return set;
    },
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CompetitiveSDVOTATracker/1.0; +local monitor)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function runNode(scriptPath, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE, [scriptPath], {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${scriptPath} exited ${code}\n${err}`));
    });
  });
}

async function checkSource(key, source) {
  const local = readJson(source.dataFile);
  const retrievedAt = new Date().toISOString();
  const html = await fetchText(source.historyUrl);
  const contentHash = hashSourceHtml(html);
  let remote = source.listVersions(html);
  if (source.sitemapUrl) {
    try {
      const sitemapHtml = await fetchText(source.sitemapUrl);
      const fromSitemap = listReleaseNoteVersions(sitemapHtml);
      remote = mergeReleaseVersions(remote, fromSitemap);
    } catch (err) {
      console.warn(`[monitor] ${source.label} sitemap index failed:`, err.message);
    }
  }
  const known = source.knownVersions(local);
  const added = remote.filter((id) => !known.has(id));
  const secondary = [];

  if (source.secondaryHistoryUrl && source.listSecondaryVersions) {
    try {
      const html2 = await fetchText(source.secondaryHistoryUrl);
      const remote2 = source.listSecondaryVersions(html2);
      secondary.push({
        sourceUrl: source.secondaryHistoryUrl,
        retrievedAt: new Date().toISOString(),
        contentHash: hashSourceHtml(html2),
        remoteCount: remote2.length,
      });
      for (const id of remote2) {
        if (!known.has(id) && !added.includes(id)) added.push(id);
      }
    } catch (err) {
      console.warn(
        `[monitor] ${source.label} secondary index failed:`,
        err.message
      );
    }
  }

  return {
    brand: key,
    label: source.label,
    sourceUrl: source.historyUrl,
    retrievedAt,
    contentHash,
    parserVersion: PARSER_VERSION,
    remoteCount: remote.length,
    localCount: known.size,
    added,
    secondary,
    needsScrape: added.length > 0 || !local,
  };
}

export function readMonitorStatus() {
  return readJson(STATUS);
}

/**
 * True when a monitor run produced new or revised OTA cards that should
 * be committed. Timestamp-only status writes are not publishable.
 * Does not publish when scrape failed, so incomplete data is not shipped.
 */
export function monitorHasPublishableUpdate(status) {
  const summary = status?.summary;
  if (!Array.isArray(summary) || !summary.length) return false;
  return summary.some((row) => {
    if (!row?.scraped) return false;
    if ((row.added || 0) > 0) return true;
    if (row.contentUnchanged === false) return true;
    return false;
  });
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exclusive lock so LaunchAgent + `npm start` cannot scrape the same
 * files at once. Returns a release function, or null if another live
 * monitor owns the lock.
 */
export function acquireMonitorLock(lockPath = MONITOR_LOCK_FILE) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const payload = `${JSON.stringify({
    pid: process.pid,
    at: new Date().toISOString(),
  })}\n`;

  const tryCreate = () => {
    const fd = openSync(lockPath, "wx");
    writeSync(fd, payload);
    closeSync(fd);
    return () => {
      try {
        unlinkSync(lockPath);
      } catch {
        /* already cleared */
      }
    };
  };

  try {
    return tryCreate();
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }

  let holder = null;
  try {
    holder = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    holder = null;
  }

  if (holder && pidIsAlive(Number(holder.pid))) {
    return null;
  }

  try {
    unlinkSync(lockPath);
  } catch {
    /* raced with another clearer */
  }

  try {
    return tryCreate();
  } catch (err) {
    if (err?.code === "EEXIST") return null;
    throw err;
  }
}

export async function runMonitor() {
  mkdirSync(DATA, { recursive: true });
  const releaseLock = acquireMonitorLock();
  if (!releaseLock) {
    console.log("[monitor] Another sync is already running; skipping.");
    return readMonitorStatus() || {
      schemaVersion: 1,
      parserVersion: PARSER_VERSION,
      checkedAt: new Date().toISOString(),
      skipped: true,
      summary: [],
    };
  }

  try {
    return await runMonitorUnlocked();
  } finally {
    releaseLock();
  }
}

async function runMonitorUnlocked() {
  const checkedAt = new Date().toISOString();
  console.log(`[monitor] ${checkedAt}`);

  const refreshLatest = String(process.env.REFRESH_LATEST || "5");
  const results = {};
  const sourceKeys = Object.keys(SOURCES);
  for (let i = 0; i < sourceKeys.length; i++) {
    const key = sourceKeys[i];
    const source = SOURCES[key];
    if (i > 0) await sleep(1500);
    try {
      const check = await checkSource(key, source);
      results[key] = { ...check, scraped: false, error: null };

      const hasLocal = !!readJson(source.dataFile);
      if (!check.needsScrape) {
        console.log(
          `[monitor] ${source.label}: no new versions (${check.remoteCount} indexed) → refresh latest notes`
        );
      } else {
        console.log(
          `[monitor] ${source.label}: ${check.added.length || "all"} new → scraping…`
        );
        if (check.added.length) {
          console.log(
            `[monitor] new ${source.label}:`,
            check.added.slice(0, 12).join(", ") +
              (check.added.length > 12 ? "…" : "")
          );
        }
      }

      await runNode(source.scrapeScript, {
        REFRESH_LATEST: refreshLatest,
        // Skip live Electrek fetch when local data exists. scrape.mjs still
        // re-merges the 2012–2016 Electrek cache so those cards are not dropped.
        SKIP_ELECTREK: hasLocal ? "1" : "0",
      });
      results[key].scraped = true;
      const after = readJson(source.dataFile);
      results[key].localCount = source.knownVersions(after).size;
      results[key].featureCount = after?.featureCount ?? null;
      results[key].scrapedAt = after?.scrapedAt ?? null;
      results[key].contentUnchanged = !!after?.contentUnchanged;
    } catch (err) {
      console.error(`[monitor] ${source.label} failed:`, err.message);
      results[key] = {
        ...(results[key] || { brand: key, label: source.label }),
        error: err.message,
        scraped: false,
      };
    }
  }

  const previous = readMonitorStatus();
  const status = {
    schemaVersion: 1,
    parserVersion: PARSER_VERSION,
    checkedAt,
    lastSuccessfulSync: previous?.lastSuccessfulSync || null,
    results,
    summary: Object.values(results).map((r) => ({
      brand: r.brand,
      added: r.added?.length || 0,
      scraped: !!r.scraped,
      contentUnchanged: !!r.contentUnchanged,
      sourceUrl: r.sourceUrl || null,
      retrievedAt: r.retrievedAt || null,
      contentHash: r.contentHash || null,
      parserVersion: r.parserVersion || PARSER_VERSION,
      error: r.error || null,
    })),
  };
  const publishable = monitorHasPublishableUpdate(status);
  if (publishable) status.lastSuccessfulSync = checkedAt;
  writeFileSync(STATUS, JSON.stringify(status, null, 2));

  const addedTotal = status.summary.reduce((n, s) => n + s.added, 0);
  const scrapedNew = status.summary.some((s) => s.scraped && !s.contentUnchanged);
  if (publishable) {
    try {
      const { defaultHistoryStore } = await import("./dev-history.mjs");
      const { loadEditsDoc } = await import("./feature-edits.mjs");
      defaultHistoryStore.recordEvent({
        actorType: "system",
        actorName: "ota-source-sync",
        source: "system",
        actionType: "source_sync",
        title: "OTA source sync",
        summary: `Imported ${addedTotal} new or revised Tesla/Rivian OTA page(s).`,
        changedAreas: ["data/releases.json", "data/rivian-releases.json"],
        snapshot: loadEditsDoc(),
      });
    } catch (err) {
      console.warn("[monitor] history record skipped:", err.message);
    }
  }

  if (addedTotal === 0 && !scrapedNew) {
    console.log("[monitor] No new OTA release notes.");
  } else {
    console.log(
      `[monitor] Updated with ${addedTotal} new OTA page(s); feature cards will refresh.`
    );
  }
  console.log(`AGENT_MONITOR_RESULT ${JSON.stringify(status.summary)}`);
  return status;
}


function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  if (process.argv.includes("--publish-check")) {
    const status = readMonitorStatus();
    const publish = monitorHasPublishableUpdate(status);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
    }
    console.log(publish ? "publish=true" : "publish=false");
    process.exit(0);
  }
  runMonitor().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
