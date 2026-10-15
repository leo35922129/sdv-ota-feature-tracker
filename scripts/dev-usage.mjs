/**
 * Local Cursor development-time and token-usage estimates for this project.
 * Reads agent transcripts on disk and git history. Does not call Cursor billing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./feature-edits.mjs";

export const CHARS_PER_TOKEN = 4;
export const SESSION_GAP_MS = 45 * 60 * 1000;
export const MIN_SESSION_MS = 2 * 60 * 1000;

export const USAGE_FEATURES = [
  { id: "usage-reports", label: "Development time & token reports", pattern: /token usage|development time|dev time report/i },
  { id: "history-backup", label: "History, undo, and GitHub backup", pattern: /\bhistory\b|undo|backup to github/i },
  { id: "image-review", label: "Image Review", pattern: /image review|candidate|placeholder selected/i },
  { id: "glean", label: "Glean recommendations", pattern: /\bglean\b/i },
  { id: "workplace", label: "Admin workplace and login", pattern: /admin login|workplace|sign out|\bmenu\b/i },
  { id: "ota-sync", label: "Tesla / Rivian OTA monitoring", pattern: /\bmonitor\b|\bscrape\b|ota source|riviantrackr|notatesla/i },
  { id: "historical-data", label: "Historical Tesla / Rivian cards", pattern: /electrek|2012|2017–2019|2017-2019|model 3 historical|model s/i },
  { id: "feature-edits", label: "Feature-card edits and tags", pattern: /feature card|tag|categor|overlay|feature-edits/i },
  { id: "deploy", label: "GitHub Pages and deploy", pattern: /github pages|workflow|deploy/i },
  { id: "public-ui", label: "Public chart, search, and filters", pattern: /search|hero|chart|filter|vehicle model/i },
  { id: "other", label: "Other Cursor work", pattern: /./ },
];

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function defaultTranscriptsDir(root = ROOT) {
  const slug = String(root || "").replace(/^\//, "").replace(/\//g, "-");
  return join(homedir(), ".cursor/projects", slug, "agent-transcripts");
}

export function parseCursorTimestamp(raw) {
  const text = String(raw || "");
  const m = text.match(
    /([A-Za-z]{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2})\s*(AM|PM)\s*\(UTC([+-]\d+)\)/i
  );
  if (m) {
    let hour = Number(m[4]) % 12;
    if (m[6].toUpperCase() === "PM") hour += 12;
    const utc = Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2]), hour, Number(m[5]));
    return utc - Number(m[7]) * 3600 * 1000;
  }
  const iso = Date.parse(text);
  return Number.isNaN(iso) ? null : iso;
}

export function estimateTokensFromChars(chars) {
  return Math.max(0, Math.round(Number(chars || 0) / CHARS_PER_TOKEN));
}

export function classifyUsageFeature(query) {
  const text = String(query || "");
  return USAGE_FEATURES.find((item) => item.pattern.test(text)) || USAGE_FEATURES.at(-1);
}

export function sessionize(timestamps, gapMs = SESSION_GAP_MS, minMs = MIN_SESSION_MS) {
  const times = [...timestamps].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!times.length) return [];
  const sessions = [];
  let start = times[0];
  let prev = times[0];
  for (let i = 1; i < times.length; i += 1) {
    const t = times[i];
    if (t - prev > gapMs) {
      sessions.push({ startedAt: start, endedAt: prev, durationMs: Math.max(minMs, prev - start) });
      start = t;
    }
    prev = t;
  }
  sessions.push({ startedAt: start, endedAt: prev, durationMs: Math.max(minMs, prev - start) });
  return sessions;
}

export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.round(Number(ms || 0) / 60000));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const minutes = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function localDayKey(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function listJsonlFiles(dir) {
  if (!dir) return [];
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const st = statSync(path);
      if (st.isDirectory()) stack.push(path);
      else if (name.endsWith(".jsonl")) out.push(path);
    }
  }
  return out.sort();
}

function extractQuery(text) {
  const match = String(text || "").match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  return match ? match[1].trim() : "";
}

function extractTimestamp(text) {
  const match = String(text || "").match(/<timestamp>\s*([\s\S]*?)\s*<\/timestamp>/);
  return match ? parseCursorTimestamp(match[1].trim()) : null;
}

function messageText(entry) {
  const parts = entry?.message?.content;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => (part?.type === "text" ? part.text || "" : "")).join("\n");
}

export function parseTranscriptFile(path, contents) {
  const turns = [];
  let current = null;
  for (const line of String(contents || "").split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const text = messageText(entry);
    const chars = line.length;
    if (entry.role === "user") {
      const query = extractQuery(text);
      if (query) {
        if (current) turns.push(current);
        current = {
          query,
          feature: classifyUsageFeature(query),
          startedAt: extractTimestamp(text),
          chars,
        };
        continue;
      }
    }
    if (current) current.chars += chars;
    else if (!turns.length) {
      current = {
        query: "",
        feature: classifyUsageFeature("other"),
        startedAt: extractTimestamp(text),
        chars,
      };
    }
  }
  if (current) turns.push(current);
  return {
    id: path.split("/").pop().replace(/\.jsonl$/, ""),
    turns,
  };
}

function gitFirstCommitIso(cwd = ROOT) {
  const result = spawnSync("git", ["log", "--format=%aI", "--reverse"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const iso = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return iso || null;
}

function gitCommitDays(cwd = ROOT) {
  const result = spawnSync("git", ["log", "--format=%ad", "--date=short"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return { commits: 0, days: {} };
  const days = {};
  const lines = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const day of lines) days[day] = (days[day] || 0) + 1;
  return { commits: lines.length, days };
}

export function collectUsageReport(options = {}) {
  const transcriptsDir = options.transcriptsDir || defaultTranscriptsDir(options.root || ROOT);
  const files = listJsonlFiles(transcriptsDir);
  const featureTotals = Object.fromEntries(
    USAGE_FEATURES.map((item) => [item.id, { id: item.id, label: item.label, tokens: 0, turns: 0 }])
  );
  const timestamps = [];
  let totalChars = 0;
  let conversations = 0;
  for (const path of files) {
    conversations += 1;
    const parsed = parseTranscriptFile(path, readFileSync(path, "utf8"));
    for (const turn of parsed.turns) {
      totalChars += turn.chars;
      const tokens = estimateTokensFromChars(turn.chars);
      const feature = featureTotals[turn.feature.id] || featureTotals.other;
      feature.tokens += tokens;
      feature.turns += 1;
      if (turn.startedAt) timestamps.push(turn.startedAt);
    }
  }
  const sessions = sessionize(timestamps);
  const activeMs = sessions.reduce((sum, item) => sum + item.durationMs, 0);
  const git = options.git || {
    firstCommit: gitFirstCommitIso(options.root || ROOT),
    ...gitCommitDays(options.root || ROOT),
  };
  const firstTranscript = timestamps.length ? Math.min(...timestamps) : null;
  const lastTranscript = timestamps.length ? Math.max(...timestamps) : null;
  const dayOneMs = [git.firstCommit ? Date.parse(git.firstCommit) : null, firstTranscript]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)[0] || null;
  const now = options.now || Date.now();
  const calendarDays = dayOneMs
    ? Math.max(1, Math.ceil((now - dayOneMs) / (24 * 60 * 60 * 1000)))
    : 0;
  const totalTokens = estimateTokensFromChars(totalChars);
  const byFeature = USAGE_FEATURES.map((item) => ({
    ...featureTotals[item.id],
    share: totalTokens ? featureTotals[item.id].tokens / totalTokens : 0,
  }))
    .filter((item) => item.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);

  const byDayMap = {};
  const addDay = (date) => {
    if (!date) return null;
    if (!byDayMap[date]) byDayMap[date] = { date, sessions: 0, activeMs: 0, commits: 0 };
    return byDayMap[date];
  };
  for (const session of sessions) {
    const row = addDay(localDayKey(session.startedAt));
    if (!row) continue;
    row.sessions += 1;
    row.activeMs += session.durationMs;
  }
  for (const [date, count] of Object.entries(git.days || {})) {
    const row = addDay(date);
    if (row) row.commits = Number(count) || 0;
  }
  const byDay = Object.values(byDayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, activeLabel: formatDuration(row.activeMs) }));

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    estimated: true,
    sourceNote:
      "Active time and tokens are estimated from local Cursor agent transcripts for this project (~4 characters per token), plus git history for day one. This is not a Cursor invoice or official billing export.",
    time: {
      dayOne: dayOneMs ? new Date(dayOneMs).toISOString() : null,
      lastActivity: lastTranscript ? new Date(lastTranscript).toISOString() : null,
      calendarDays,
      activeMs,
      activeLabel: formatDuration(activeMs),
      sessions: sessions.length,
      conversations,
      transcriptFiles: files.length,
      commits: git.commits || 0,
      commitDays: Object.keys(git.days || {}).length,
      byDay,
    },
    tokens: {
      total: totalTokens,
      conversations,
      turns: byFeature.reduce((sum, item) => sum + item.turns, 0),
      byFeature,
    },
  };
}
