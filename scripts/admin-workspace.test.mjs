#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderDevelopmentHistoryHtml,
  renderDevelopmentTimeHtml,
  renderImageReviewHtml,
  renderTokenUsageHtml,
  renderWorkspaceChrome,
} from "./admin-workspace.mjs";

test("History tab sits beside Image Review and keeps existing modes", () => {
  const html = renderWorkspaceChrome({ mode: "history", mock: true, brand: "tesla" });
  const report = html.indexOf("Development Report");
  const images = html.indexOf("Image Review");
  const history = html.indexOf(">History<");
  const time = html.indexOf(">Dev Time<");
  const tokens = html.indexOf(">Token Usage<");
  assert.ok(report >= 0);
  assert.ok(images > report);
  assert.ok(history > images);
  assert.ok(time > history);
  assert.ok(tokens > time);
  assert.match(html, /aria-selected="true"[^>]*>History/);
  const backup = html.indexOf('data-history-backup');
  const close = html.indexOf('data-close-workspace');
  assert.ok(backup > history);
  assert.ok(close > backup);
  assert.match(html, /admin-workspace-window-actions[\s\S]*data-history-backup[\s\S]*data-close-workspace/);
  const mockFlag = html.indexOf("admin-mock-flag");
  assert.ok(mockFlag > close);
  assert.match(html, /admin-workspace-toolbar-row[\s\S]*admin-workspace-window-actions[\s\S]*admin-mock-flag/);
  assert.match(
    renderWorkspaceChrome({ mode: "report", brand: "tesla" }),
    /data-history-backup/
  );
  assert.match(
    renderWorkspaceChrome({ mode: "images", brand: "tesla" }),
    /data-history-backup/
  );
  assert.match(
    renderWorkspaceChrome({ mode: "time", brand: "tesla" }),
    /data-history-backup/
  );
  assert.match(
    renderWorkspaceChrome({ mode: "tokens", brand: "tesla" }),
    /data-history-backup/
  );
});

test("History table is chronological UI with actor filters, backup, and accessible labels", () => {
  const html = renderDevelopmentHistoryHtml({
    extra: { actorType: "all", actionType: "all", range: "all" },
    page: {
      page: 1,
      pages: 2,
      items: [
        {
          id: "cur",
          versionLabel: "v2",
          createdAt: "2026-08-22T16:00:00.000Z",
          actorType: "user",
          actorName: "lei@localhost",
          title: "Edited feature card",
          summary: "Updated overlay",
          changedAreas: ["data/feature-edits.json"],
          actionType: "design_edit",
          source: "user",
          isCurrent: true,
          undoable: true,
        },
        {
          id: "old",
          versionLabel: "v1",
          createdAt: "2026-08-22T15:00:00.000Z",
          actorType: "system",
          actorName: "ota-source-sync",
          title: "OTA source sync",
          summary: "Imported notes",
          changedAreas: ["data/releases.json"],
          actionType: "source_sync",
          source: "system",
          isCurrent: false,
          undoable: true,
        },
      ],
    },
  });
  assert.doesNotMatch(html, /admin-history-title/);
  assert.doesNotMatch(html, /data-history-backup/);
  assert.match(html, /aria-label="Actor"/);
  assert.match(html, /<option value="all" selected>All<\/option>/);
  assert.match(html, /<option value="system"\s*>System<\/option>/);
  assert.match(html, /<option value="user"\s*>User<\/option>/);
  assert.match(html, /aria-label="Development history"/);
  assert.match(html, /tabindex="0"/);
  assert.doesNotMatch(html, /admin-pager|data-history-page|>Previous<|>Next</);
  assert.match(html, /Current/);
  assert.match(html, /data-history-undo="cur"[^>]*\sdisabled\s/);
  assert.match(html, /data-history-undo="old"\s+aria-disabled="false"/);
  assert.doesNotMatch(html, /snapshotPayload/);
  assert.doesNotMatch(html, /ghp_/);
  assert.doesNotMatch(html, /GITHUB_TOKEN/);
});

test("Backup and restore loading states disable the GitHub backup button", () => {
  const home = renderWorkspaceChrome({
    mode: "report",
    backupState: { state: "loading", message: "Backing up…" },
  });
  assert.match(home, />Backing up…</);
  assert.match(home, /data-history-backup[^>]*disabled/);
  assert.match(home, /aria-busy="true"/);

  const restoringChrome = renderWorkspaceChrome({
    mode: "history",
    restoreState: { state: "loading", message: "Restoring…" },
  });
  assert.match(restoringChrome, /data-history-backup[^>]*disabled/);

  const restoring = renderDevelopmentHistoryHtml({
    restoreState: { state: "loading", message: "Restoring…" },
    page: {
      items: [
        {
          id: "old",
          versionLabel: "v1",
          undoable: true,
          isCurrent: false,
          actorType: "user",
        },
      ],
    },
  });
  assert.match(restoring, /Restoring…/);
  assert.match(restoring, /data-history-undo="old"[^>]*disabled/);
});

test("Dev Time and Token Usage reports show estimates without transcript text", () => {
  const report = {
    ok: true,
    sourceNote: "Estimated from local Cursor agent transcripts (~4 characters per token).",
    time: {
      dayOne: "2026-08-16T16:37:12.000Z",
      calendarDays: 7,
      activeLabel: "4h 12m",
      sessions: 9,
      conversations: 5,
      commits: 12,
      byDay: [
        { date: "2026-08-16", activeLabel: "2h 10m", sessions: 3, commits: 4 },
        { date: "2026-08-17", activeLabel: "2h 2m", sessions: 6, commits: 8 },
      ],
    },
    tokens: {
      total: 123456,
      conversations: 5,
      turns: 40,
      byFeature: [
        { id: "image-review", label: "Image Review", turns: 12, tokens: 80000, share: 0.65 },
        { id: "history-backup", label: "History, undo, and GitHub backup", turns: 8, tokens: 43456, share: 0.35 },
      ],
    },
  };
  const timeHtml = renderDevelopmentTimeHtml({ report });
  assert.match(timeHtml, /data-day-one="2026-08-16T16:37:12.000Z"/);
  assert.match(timeHtml, /class="admin-metric is-nowrap"/);
  assert.doesNotMatch(timeHtml, /2026, 12:37/);
  assert.match(timeHtml, /aria-label="Development time by day"/);
  assert.match(timeHtml, />4h 12m</);
  assert.match(timeHtml, />2026-08-16</);
  assert.match(timeHtml, /Estimated from local Cursor agent transcripts/);
  assert.doesNotMatch(timeHtml, /<user_query>|ghp_|GITHUB_TOKEN/);

  const tokenHtml = renderTokenUsageHtml({ report });
  assert.match(tokenHtml, /data-total-tokens="123456"/);
  assert.match(tokenHtml, /aria-label="Token usage by development feature"/);
  assert.match(tokenHtml, /Image Review/);
  assert.match(tokenHtml, /History, undo, and GitHub backup/);
  assert.match(tokenHtml, /65\.0%/);
  assert.doesNotMatch(tokenHtml, /<user_query>|snapshotPayload|ghp_/);
});

test("Image Review titles open the feature detail card", () => {
  const html = renderImageReviewHtml({
    items: [
      {
        id: "15-inch-horizontal-touchscreen",
        title: "15-inch horizontal touchscreen",
        brand: "Tesla",
        models: ["S", "3"],
        category: "UI / Visualization",
        version: "2026.26",
        candidates: [],
      },
    ],
    extra: {},
    sort: "needs-review",
    selectedIds: [],
  });
  assert.match(
    html,
    /<h3><button type="button" class="admin-feature-link" data-open-feature="15-inch-horizontal-touchscreen">15-inch horizontal touchscreen<\/button><\/h3>/
  );
  assert.doesNotMatch(html, /Open Feature Detail/);
});
