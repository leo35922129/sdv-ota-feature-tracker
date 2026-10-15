#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyUsageFeature,
  collectUsageReport,
  estimateTokensFromChars,
  formatDuration,
  parseCursorTimestamp,
  parseTranscriptFile,
  sessionize,
} from "./dev-usage.mjs";

function userLine(query, timestamp) {
  return JSON.stringify({
    role: "user",
    message: {
      content: [
        {
          type: "text",
          text: `<timestamp>${timestamp}</timestamp>\n<user_query>\n${query}\n</user_query>`,
        },
      ],
    },
  });
}

function assistantLine(text) {
  return JSON.stringify({
    role: "assistant",
    message: { content: [{ type: "text", text }] },
  });
}

test("parses Cursor transcript timestamps in Eastern time", () => {
  const ms = parseCursorTimestamp("Wednesday, Aug 19, 2026, 12:20 PM (UTC-4)");
  assert.equal(new Date(ms).toISOString(), "2026-08-19T16:20:00.000Z");
});

test("classifies development features from user queries", () => {
  assert.equal(classifyUsageFeature("Add a token usage report").id, "usage-reports");
  assert.equal(classifyUsageFeature("Backup to GitHub from History").id, "history-backup");
  assert.equal(classifyUsageFeature("Open Image Review").id, "image-review");
  assert.equal(classifyUsageFeature("pwd and ls").id, "other");
});

test("sessionizes timestamps with a 45-minute gap and 2-minute minimum", () => {
  const start = Date.parse("2026-08-16T16:00:00.000Z");
  const sessions = sessionize([start, start + 60_000, start + 3 * 60 * 60_000]);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].durationMs, 2 * 60_000);
  assert.equal(sessions[1].durationMs, 2 * 60_000);
});

test("estimates tokens from transcript characters", () => {
  assert.equal(estimateTokensFromChars(8), 2);
  assert.equal(formatDuration(90 * 60_000), "1h 30m");
});

test("collects time and per-feature token totals without leaking transcript text", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-usage-"));
  mkdirSync(join(dir, "a"), { recursive: true });
  writeFileSync(
    join(dir, "a", "one.jsonl"),
    [
      userLine("Add History undo and Backup to GitHub", "Saturday, Aug 16, 2026, 9:00 AM (UTC-4)"),
      assistantLine("Added history restore."),
      userLine("Open Image Review for missing screenshots", "Saturday, Aug 16, 2026, 9:20 AM (UTC-4)"),
      assistantLine("Rendered image review."),
    ].join("\n")
  );
  writeFileSync(
    join(dir, "two.jsonl"),
    [
      userLine("Show development time report and token usage", "Sunday, Aug 17, 2026, 1:00 PM (UTC-4)"),
      assistantLine("Built usage tabs."),
    ].join("\n")
  );

  const report = collectUsageReport({
    transcriptsDir: dir,
    git: {
      firstCommit: "2026-08-16T12:37:12-04:00",
      commits: 4,
      days: { "2026-08-16": 3, "2026-08-17": 1 },
    },
    now: Date.parse("2026-08-22T12:00:00.000Z"),
  });

  assert.equal(report.ok, true);
  assert.equal(report.estimated, true);
  assert.equal(report.time.conversations, 2);
  assert.equal(report.time.transcriptFiles, 2);
  assert.equal(report.time.commits, 4);
  assert.equal(report.time.commitDays, 2);
  assert.ok(report.time.calendarDays >= 6);
  assert.ok(report.time.activeMs >= 4 * 60_000);
  assert.match(report.time.activeLabel, /\d/);
  assert.ok(report.tokens.total > 0);
  const ids = report.tokens.byFeature.map((item) => item.id);
  assert.ok(ids.includes("history-backup"));
  assert.ok(ids.includes("image-review"));
  assert.ok(ids.includes("usage-reports"));
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Backup to GitHub"), false);
  assert.equal(serialized.includes("<user_query>"), false);
  assert.equal(serialized.includes(dir), false);
  assert.equal(serialized.includes("ghp_"), false);
});

test("parseTranscriptFile attributes assistant bytes to the current user turn", () => {
  const parsed = parseTranscriptFile(
    "/tmp/demo.jsonl",
    [userLine("Image Review", "Saturday, Aug 16, 2026, 9:00 AM (UTC-4)"), assistantLine("ok")].join("\n")
  );
  assert.equal(parsed.turns.length, 1);
  assert.equal(parsed.turns[0].feature.id, "image-review");
  assert.ok(parsed.turns[0].chars > 20);
});

test("day one uses the first git commit when transcripts are empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-usage-empty-"));
  const report = collectUsageReport({
    transcriptsDir: dir,
    now: Date.parse("2026-08-22T16:00:00.000Z"),
  });
  assert.equal(report.ok, true);
  assert.ok(String(report.time.dayOne || "").startsWith("2026-08-16"));
  assert.ok(report.time.commits > 0);
  assert.equal(report.tokens.total, 0);
});
