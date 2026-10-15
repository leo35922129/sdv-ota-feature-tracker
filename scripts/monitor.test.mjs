#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hashSourceHtml,
  monitorHasPublishableUpdate,
  PARSER_VERSION,
} from "./monitor.mjs";
import { listReleaseNoteVersions, mergeReleaseVersions } from "./scrape.mjs";

test("source HTML hashes are stable and change with content", () => {
  const a = hashSourceHtml('<a href="https://www.notateslaapp.com/software-updates/version/2026.26/release-notes">');
  const b = hashSourceHtml('<a href="https://www.notateslaapp.com/software-updates/version/2026.26/release-notes">');
  const c = hashSourceHtml('<a href="https://www.notateslaapp.com/software-updates/version/2026.32/release-notes">');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(PARSER_VERSION, "ota-source-sync-v1");
});

test("does not publish when there is no summary", () => {
  assert.equal(monitorHasPublishableUpdate(null), false);
  assert.equal(monitorHasPublishableUpdate({}), false);
  assert.equal(monitorHasPublishableUpdate({ summary: [] }), false);
});

test("does not publish timestamp-only checks with no new notes", () => {
  assert.equal(
    monitorHasPublishableUpdate({
      summary: [
        {
          brand: "tesla",
          added: 0,
          scraped: true,
          contentUnchanged: true,
          error: null,
        },
        {
          brand: "rivian",
          added: 0,
          scraped: true,
          contentUnchanged: true,
          error: null,
        },
      ],
    }),
    false
  );
});

test("publishes when a brand added new OTA pages and scrape succeeded", () => {
  assert.equal(
    monitorHasPublishableUpdate({
      summary: [
        {
          brand: "tesla",
          added: 2,
          scraped: true,
          contentUnchanged: false,
          error: null,
        },
        {
          brand: "rivian",
          added: 0,
          scraped: true,
          contentUnchanged: true,
          error: null,
        },
      ],
    }),
    true
  );
});

test("publishes when latest notes changed even without a new version id", () => {
  assert.equal(
    monitorHasPublishableUpdate({
      summary: [
        {
          brand: "tesla",
          added: 0,
          scraped: true,
          contentUnchanged: false,
          error: null,
        },
      ],
    }),
    true
  );
});

test("does not publish incomplete data when scrape failed", () => {
  assert.equal(
    monitorHasPublishableUpdate({
      summary: [
        {
          brand: "tesla",
          added: 3,
          scraped: false,
          contentUnchanged: false,
          error: "HTTP 503",
        },
      ],
    }),
    false
  );
});

test("scheduled GitHub job checks sources and can publish OTA data", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/sync-ota-sources.yml", import.meta.url),
    "utf8"
  );
  assert.match(workflow, /cron: "\*\/30 \* \* \* \*"/);
  assert.match(workflow, /node scripts\/monitor\.mjs/);
  assert.match(workflow, /node scripts\/monitor\.mjs --publish-check/);
  assert.match(workflow, /git add -u --/);
  assert.doesNotMatch(workflow, /GM-SDV/);
  const deployPages = readFileSync(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8"
  );
  assert.match(deployPages, /workflow_dispatch/);
  assert.doesNotMatch(deployPages, /GM-SDV/);
  assert.doesNotMatch(deployPages, /push:\s*\n\s*branches:/);
});

test("sitemap release notes are kept when the history page omits them", () => {
  const history = `
    <a href="https://www.notateslaapp.com/software-updates/version/2026.26/release-notes">2026.26</a>
    <a href="/software-updates/version/2024.44/release-notes">2024.44</a>
  `;
  const sitemap = `
    <loc>https://www.notateslaapp.com/software-updates/version/2024.39.10/release-notes</loc>
    <loc>https://www.notateslaapp.com/software-updates/version/2026.26/release-notes</loc>
    <loc>https://www.notateslaapp.com/software-updates/version/2024.39.5/release-notes</loc>
  `;
  const merged = mergeReleaseVersions(
    listReleaseNoteVersions(history),
    listReleaseNoteVersions(sitemap)
  );
  assert.deepEqual(merged, ["2026.26", "2024.44", "2024.39.10", "2024.39.5"]);
});
