#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHistoryStore,
  filterHistoryEvents,
  sortHistoryNewestFirst,
  paginateHistory,
  snapshotHash,
  publicHistoryEvent,
} from "./dev-history.mjs";
import { backupCurrentVersion } from "./dev-history-backup.mjs";

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), "dev-history-"));
  mkdirSync(join(dir, "snapshots"), { recursive: true });
  const editsPath = join(dir, "feature-edits.json");
  const initial = { version: 1, edits: [{ id: "a", title: "One" }] };
  writeFileSync(editsPath, JSON.stringify(initial));
  let edits = initial;
  const store = createHistoryStore({
    adminDir: dir,
    historyPath: join(dir, "dev-history.json"),
    snapshotsDir: join(dir, "snapshots"),
    loadEdits: () => JSON.parse(JSON.stringify(edits)),
    saveEdits: (next) => {
      edits = JSON.parse(JSON.stringify(next));
      writeFileSync(editsPath, JSON.stringify(edits));
    },
  });
  return { store, editsPath, getEdits: () => edits, setEdits: (next) => (edits = next) };
}

test("records system and user events and filters by actor type", () => {
  const { store, setEdits } = makeStore();
  store.ensureBaseline();
  store.recordEvent({
    actorType: "system",
    actorName: "monitor",
    source: "system",
    actionType: "source_sync",
    title: "Tesla OTA sync",
    summary: "Imported new notes",
    changedAreas: ["data/releases.json"],
    snapshot: { version: 1, edits: [{ id: "a", title: "One" }] },
    undoable: false,
  });
  setEdits({ version: 1, edits: [{ id: "a", title: "Two" }] });
  store.recordEvent({
    actorType: "user",
    actorName: "lei@localhost",
    source: "user",
    actionType: "design_edit",
    title: "Edited feature card",
    summary: "Updated Camera Preview overlay",
    snapshot: { version: 1, edits: [{ id: "a", title: "Two" }] },
  });
  const all = store.listHistory({ actorType: "all", pageSize: 50 });
  const users = store.listHistory({ actorType: "user", pageSize: 50 });
  const systems = store.listHistory({ actorType: "system", pageSize: 50 });
  assert.ok(all.items.length >= 2);
  assert.ok(users.items.every((item) => item.actorType === "user"));
  assert.ok(systems.items.every((item) => item.actorType === "system"));
  assert.ok(users.items.some((item) => item.actionType === "design_edit"));
});

test("lists newest first; workplace history returns the full list", () => {
  const events = [
    { createdAt: "2026-01-01T00:00:00.000Z", versionNumber: 1 },
    { createdAt: "2026-01-03T00:00:00.000Z", versionNumber: 3 },
    { createdAt: "2026-01-02T00:00:00.000Z", versionNumber: 2 },
  ];
  const sorted = sortHistoryNewestFirst(events);
  assert.equal(sorted[0].versionNumber, 3);
  const sliced = paginateHistory(sorted, 2, 1);
  assert.equal(sliced.page, 2);
  assert.equal(sliced.total, 3);
  assert.equal(sliced.items[0].versionNumber, 2);
  const { store } = makeStore();
  store.ensureBaseline();
  for (let i = 0; i < 30; i += 1) {
    store.recordEvent({
      actorType: "user",
      actionType: "design_edit",
      title: `Edit ${i}`,
      snapshot: { version: 1, edits: [{ id: "a", title: `Edit ${i}` }] },
    });
  }
  const listed = store.listHistory();
  assert.equal(listed.pages, 1);
  assert.equal(listed.items.length, listed.total);
  assert.ok(listed.items.length >= 30);
  const filtered = filterHistoryEvents(
    [
      { actorType: "user", actionType: "design_edit", createdAt: "2026-08-22T00:00:00.000Z" },
      { actorType: "system", actionType: "source_sync", createdAt: "2020-01-01T00:00:00.000Z" },
    ],
    { actorType: "user", range: "30d" },
    Date.parse("2026-08-22T12:00:00.000Z")
  );
  assert.equal(filtered.length, 1);
});

test("skips duplicate design state and never exposes snapshot payloads", () => {
  const { store } = makeStore();
  const first = store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Edit",
    snapshot: { version: 1, edits: [{ id: "a", title: "One" }] },
  });
  const second = store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Edit again",
    snapshot: { version: 1, edits: [{ id: "a", title: "One" }] },
  });
  assert.equal(second.skipped, true);
  const listed = store.listHistory({ pageSize: 50 });
  assert.equal(listed.items.some((item) => "snapshotPayload" in item && item.snapshotPayload), false);
  assert.equal(publicHistoryEvent(first.event).snapshotPayload, undefined);
  assert.ok(snapshotHash({ a: 1 }));
});

test("undo restores a previous snapshot and creates a new history entry", async () => {
  const { store, getEdits } = makeStore();
  store.ensureBaseline();
  const v1 = store.loadDoc().currentEventId;
  store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Rename",
    snapshot: { version: 1, edits: [{ id: "a", title: "Changed" }] },
  });
  const beforeCount = store.loadDoc().events.length;
  const result = await store.restoreEvent(v1, { email: "lei@localhost" });
  assert.equal(result.ok, true);
  assert.equal(getEdits().edits[0].title, "One");
  const doc = store.loadDoc();
  assert.equal(doc.events.length, beforeCount + 1);
  assert.equal(doc.events.at(-1).source, "undo");
  assert.equal(doc.events.at(-1).restoredFromId, v1);
  assert.equal(doc.events.some((item) => item.id === v1), true);
  assert.equal(doc.currentEventId, doc.events.at(-1).id);
});

test("failed restore leaves the current design unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-history-fail-"));
  const editsPath = join(dir, "feature-edits.json");
  let edits = { version: 1, edits: [{ id: "a", title: "Live" }] };
  writeFileSync(editsPath, JSON.stringify(edits));
  const store = createHistoryStore({
    adminDir: dir,
    historyPath: join(dir, "dev-history.json"),
    snapshotsDir: join(dir, "snapshots"),
    loadEdits: () => edits,
    saveEdits: (next) => {
      if (next?.edits?.[0]?.title === "Old") throw new Error("disk full");
      edits = next;
      writeFileSync(editsPath, JSON.stringify(next));
    },
  });
  store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Old",
    snapshot: { version: 1, edits: [{ id: "a", title: "Old" }] },
  });
  const oldId = store.loadDoc().currentEventId;
  store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Live",
    snapshot: { version: 1, edits: [{ id: "a", title: "Live" }] },
  });
  const result = await store.restoreEvent(oldId, { email: "lei@localhost" });
  assert.equal(result.ok, false);
  assert.equal(edits.edits[0].title, "Live");
});

test("backup uses the current version and is idempotent", async () => {
  const { store } = makeStore();
  store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Edit",
    snapshot: { version: 1, edits: [{ id: "a", title: "Two" }] },
  });
  const currentLabel = store.loadDoc().events.find((item) => item.isCurrent).versionLabel;
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    if (args[0] === "status") return { code: 0, stdout: " M data/feature-edits.json\n", stderr: "" };
    if (args[0] === "diff") return { code: 0, stdout: "data/feature-edits.json\n", stderr: "" };
    if (args[0] === "rev-parse") return { code: 0, stdout: "abc123def\n", stderr: "" };
    if (args[0] === "remote") {
      return {
        code: 0,
        stdout: "origin\thttps://github.com/example/sdv-ota-feature-tracker.git (push)\n",
        stderr: "",
      };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const first = await backupCurrentVersion({ store, runGit });
  assert.equal(first.ok, true);
  assert.equal(first.commitSha, "abc123def");
  assert.match(first.message, new RegExp(currentLabel));
  const commit = calls.find((args) => args[0] === "commit");
  assert.ok(commit);
  assert.match(commit.at(-1), /chore\(backup\): save development version/);
  assert.ok(!JSON.stringify(first).includes("ghp_"));
  const second = await backupCurrentVersion({ store, runGit });
  assert.equal(second.state, "already-backed-up");
  const commitCount = calls.filter((args) => args[0] === "commit").length;
  assert.equal(commitCount, 1);
});

test("backup reports unavailable GitHub remotes without exposing secrets", async () => {
  const { store } = makeStore();
  store.ensureBaseline();
  const runGit = async (args) => {
    if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
    if (args[0] === "diff") return { code: 0, stdout: "", stderr: "" };
    if (args[0] === "rev-parse") return { code: 0, stdout: "abc\n", stderr: "" };
    if (args[0] === "remote") return { code: 0, stdout: "", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const result = await backupCurrentVersion({ store, runGit });
  assert.equal(result.ok, false);
  assert.equal(result.state, "unavailable");
  assert.equal(JSON.stringify(result).includes("GITHUB_TOKEN"), false);
});

test("concurrent restore is rejected so the current version stays consistent", async () => {
  const { store } = makeStore();
  store.ensureBaseline();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = store.withLock(async () => {
    await gate;
    return "ok";
  });
  await Promise.resolve();
  await assert.rejects(() => store.withLock(async () => "no"), (err) => err.code === "busy");
  release();
  assert.equal(await first, "ok");
});

test("undo of the current version is rejected without rewriting history", async () => {
  const { store, getEdits } = makeStore();
  store.ensureBaseline();
  const currentId = store.loadDoc().currentEventId;
  const before = store.loadDoc().events.length;
  const result = await store.restoreEvent(currentId, { email: "lei@localhost" });
  assert.equal(result.ok, false);
  assert.equal(result.state, "current");
  assert.equal(store.loadDoc().events.length, before);
  assert.equal(getEdits().edits[0].title, "One");
});

test("failed backup leaves the current version unmarked and secret-free", async () => {
  const { store } = makeStore();
  store.recordEvent({
    actorType: "user",
    actionType: "design_edit",
    title: "Edit",
    snapshot: { version: 1, edits: [{ id: "a", title: "Two" }] },
  });
  const runGit = async (args) => {
    if (args[0] === "status") return { code: 0, stdout: " M data/feature-edits.json\n", stderr: "" };
    if (args[0] === "diff") return { code: 0, stdout: "data/feature-edits.json\n", stderr: "" };
    if (args[0] === "commit") {
      const err = new Error("rejected by remote");
      err.stderr = "HOOK_TOKEN=secret";
      throw err;
    }
    if (args[0] === "rev-parse") return { code: 0, stdout: "abc123def\n", stderr: "" };
    if (args[0] === "remote") {
      return {
        code: 0,
        stdout: "origin\thttps://github.com/example/sdv-ota-feature-tracker.git (push)\n",
        stderr: "",
      };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const result = await backupCurrentVersion({ store, runGit });
  assert.equal(result.ok, false);
  assert.equal(result.state, "error");
  assert.equal(JSON.stringify(result).includes("HOOK_TOKEN"), false);
  const current = store.loadDoc().events.find((item) => item.isCurrent);
  assert.notEqual(current.backupStatus, "backed_up");
  assert.equal(current.backupCommitSha, null);
});
