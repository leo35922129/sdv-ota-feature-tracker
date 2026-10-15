/**
 * Development-history events and design snapshots.
 * Persistence lives under data/admin/ (gitignored, admin-session only).
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_DIR } from "./admin-store.mjs";
import { loadEditsDoc, saveEditsDoc } from "./feature-edits.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HISTORY_SCHEMA_VERSION = 1;
export const HISTORY_PAGE_SIZE = 25;
export const WORKSPACE_ID = "sdv-ota-tracker";
export const HISTORY_PATH = join(ADMIN_DIR, "dev-history.json");
export const SNAPSHOTS_DIR = join(ADMIN_DIR, "snapshots");

const ACTION_TYPES = new Set([
  "design_edit",
  "image_decision",
  "source_sync",
  "undo",
  "github_backup",
]);

let busy = null;

export function emptyHistoryDoc() {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    workspaceId: WORKSPACE_ID,
    currentEventId: null,
    nextVersion: 1,
    events: [],
  };
}

export function snapshotHash(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

export function publicHistoryEvent(event) {
  if (!event) return null;
  const {
    snapshotPayload: _ignored,
    ...rest
  } = event;
  return rest;
}

export function filterHistoryEvents(events, extra = {}, now = Date.now()) {
  const actor = extra.actorType || "all";
  const action = extra.actionType || "all";
  const range = extra.range || "all";
  let from = 0;
  if (range === "24h") from = now - 24 * 60 * 60 * 1000;
  else if (range === "7d") from = now - 7 * 24 * 60 * 60 * 1000;
  else if (range === "30d") from = now - 30 * 24 * 60 * 60 * 1000;
  return (events || []).filter((event) => {
    if (actor !== "all" && event.actorType !== actor) return false;
    if (action !== "all" && event.actionType !== action) return false;
    if (from && Date.parse(event.createdAt) < from) return false;
    return true;
  });
}

export function sortHistoryNewestFirst(events) {
  return [...(events || [])].sort((a, b) => {
    const td = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (td !== 0) return td;
    return (b.versionNumber || 0) - (a.versionNumber || 0);
  });
}

export function paginateHistory(events, page = 1, pageSize = HISTORY_PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || HISTORY_PAGE_SIZE);
  const total = events.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * size;
  return {
    page: current,
    pageSize: size,
    total,
    pages,
    items: events.slice(start, start + size),
  };
}

export function createHistoryStore(options = {}) {
  const adminDir = options.adminDir || ADMIN_DIR;
  const historyPath = options.historyPath || join(adminDir, "dev-history.json");
  const snapshotsDir = options.snapshotsDir || join(adminDir, "snapshots");
  const loadEdits = options.loadEdits || loadEditsDoc;
  const saveEdits = options.saveEdits || saveEditsDoc;
  const nowFn = options.now || (() => new Date().toISOString());

  function loadDoc() {
    if (!existsSync(historyPath)) return emptyHistoryDoc();
    try {
      const doc = JSON.parse(readFileSync(historyPath, "utf8"));
      if (!doc || !Array.isArray(doc.events)) return emptyHistoryDoc();
      return {
        ...emptyHistoryDoc(),
        ...doc,
        events: doc.events,
      };
    } catch {
      return emptyHistoryDoc();
    }
  }

  function saveDoc(doc) {
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, JSON.stringify(doc, null, 2) + "\n");
  }

  function writeSnapshot(id, payload) {
    mkdirSync(snapshotsDir, { recursive: true });
    const path = join(snapshotsDir, `${id}.json`);
    writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
    return path;
  }

  function readSnapshot(event) {
    if (event?.snapshotPayload) return event.snapshotPayload;
    if (!event?.snapshotReference) return null;
    const path = join(snapshotsDir, `${event.id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  }

  function captureDesignSnapshot() {
    return loadEdits();
  }

  function ensureBaseline(actor = { actorType: "system", actorName: "system" }) {
    const doc = loadDoc();
    if (doc.events.length) return doc;
    const snapshot = captureDesignSnapshot();
    return appendEvent(doc, {
      actorType: actor.actorType || "system",
      actorId: actor.actorId || actor.actorName || "system",
      actorName: actor.actorName || "system",
      source: "system",
      actionType: "design_edit",
      title: "Baseline design",
      summary: "Initial development-history snapshot of the current feature-edit overlay.",
      changedAreas: ["data/feature-edits.json"],
      undoable: true,
      snapshot,
    });
  }

  function appendEvent(doc, input) {
    const createdAt = input.createdAt || nowFn();
    const id = input.id || randomUUID();
    const versionNumber = doc.nextVersion;
    const snapshot = input.snapshot || null;
    const hash = snapshot ? snapshotHash(snapshot) : null;
    if (snapshot) writeSnapshot(id, snapshot);
    const event = {
      id,
      workspaceId: WORKSPACE_ID,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      parentVersionId: input.parentVersionId || doc.currentEventId || null,
      createdAt,
      actorType: input.actorType === "user" ? "user" : "system",
      actorId: input.actorId || input.actorName || "system",
      actorName: input.actorName || input.actorId || "system",
      source: input.source || input.actorType || "system",
      actionType: ACTION_TYPES.has(input.actionType) ? input.actionType : "design_edit",
      title: input.title || "Change",
      summary: input.summary || "",
      changedAreas: input.changedAreas || ["data/feature-edits.json"],
      snapshotReference: snapshot ? id : null,
      snapshotHash: hash,
      isCurrent: true,
      undoable: input.undoable !== false && Boolean(snapshot),
      backupStatus: input.backupStatus || "none",
      backupCommitSha: input.backupCommitSha || null,
      backupUrl: input.backupUrl || null,
      restoredFromId: input.restoredFromId || null,
    };
    const events = doc.events.map((item) => ({ ...item, isCurrent: false }));
    events.push(event);
    const next = {
      ...doc,
      currentEventId: id,
      nextVersion: versionNumber + 1,
      events,
    };
    saveDoc(next);
    return next;
  }

  function recordEvent(input) {
    const doc = ensureBaseline(input);
    const current = doc.events.find((item) => item.id === doc.currentEventId);
    const skipDuplicateState =
      input.actionType === "design_edit" || input.actionType === "image_decision";
    if (
      skipDuplicateState &&
      input.snapshot &&
      current?.snapshotHash &&
      snapshotHash(input.snapshot) === current.snapshotHash
    ) {
      return { skipped: true, reason: "duplicate-state", doc, event: current };
    }
    const next = appendEvent(doc, input);
    return {
      skipped: false,
      doc: next,
      event: next.events.find((item) => item.id === next.currentEventId),
    };
  }

  function listHistory(extra = {}) {
    const doc = ensureBaseline();
    const filtered = sortHistoryNewestFirst(filterHistoryEvents(doc.events, extra));
    const requestedSize = extra.pageSize;
    const useAll =
      requestedSize == null ||
      requestedSize === "" ||
      requestedSize === "all" ||
      Number(requestedSize) <= 0;
    const page = useAll
      ? {
          page: 1,
          pages: 1,
          total: filtered.length,
          pageSize: filtered.length,
          items: filtered,
        }
      : paginateHistory(filtered, extra.page, requestedSize);
    return {
      ok: true,
      workspaceId: WORKSPACE_ID,
      currentEventId: doc.currentEventId,
      currentVersionLabel:
        doc.events.find((item) => item.id === doc.currentEventId)?.versionLabel || null,
      ...page,
      items: page.items.map(publicHistoryEvent),
    };
  }

  function getEvent(id) {
    return loadDoc().events.find((item) => item.id === id) || null;
  }

  function updateEvent(id, patch) {
    const doc = loadDoc();
    const events = doc.events.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    const next = { ...doc, events };
    saveDoc(next);
    return events.find((item) => item.id === id);
  }

  async function withLock(fn) {
    if (busy) {
      const err = new Error("A restore or backup is already in progress");
      err.code = "busy";
      throw err;
    }
    busy = Promise.resolve()
      .then(fn)
      .finally(() => {
        busy = null;
      });
    return busy;
  }

  async function restoreEvent(eventId, actor = {}) {
    return withLock(async () => {
      const doc = loadDoc();
      const target = doc.events.find((item) => item.id === eventId);
      if (!target) {
        return { ok: false, state: "not-found", message: "That history version was not found." };
      }
      if (target.id === doc.currentEventId) {
        return { ok: false, state: "current", message: "That version is already current." };
      }
      if (!target.undoable) {
        return { ok: false, state: "not-undoable", message: "That version cannot be restored." };
      }
      const snapshot = readSnapshot(target);
      if (!snapshot) {
        return {
          ok: false,
          state: "missing-snapshot",
          message: "The snapshot for that version is missing, so the design was left unchanged.",
        };
      }
      const before = captureDesignSnapshot();
      try {
        saveEdits(snapshot);
      } catch (err) {
        try {
          saveEdits(before);
        } catch {
          /* keep original error */
        }
        return {
          ok: false,
          state: "error",
          message: err.message || "Restore failed. The current design was left unchanged.",
        };
      }
      const recorded = recordEvent({
        actorType: "user",
        actorId: actor.actorId || actor.email || actor.actorName,
        actorName: actor.actorName || actor.email || "admin",
        source: "undo",
        actionType: "undo",
        title: `Restored ${target.versionLabel}`,
        summary: `Restored the feature-edit overlay to ${target.versionLabel} (${target.title}).`,
        changedAreas: ["data/feature-edits.json"],
        parentVersionId: doc.currentEventId,
        restoredFromId: target.id,
        snapshot,
        undoable: true,
      });
      return {
        ok: true,
        state: "success",
        event: publicHistoryEvent(recorded.event),
        restoredFromId: target.id,
      };
    });
  }

  return {
    loadDoc,
    saveDoc,
    ensureBaseline,
    recordEvent,
    listHistory,
    getEvent,
    updateEvent,
    restoreEvent,
    captureDesignSnapshot,
    readSnapshot,
    withLock,
  };
}

export const defaultHistoryStore = createHistoryStore();
