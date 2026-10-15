#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAdminApi } from "./admin-api.mjs";

function captureSendJson() {
  const captured = { status: 0, body: null };
  return {
    captured,
    sendJson(_res, status, body) {
      captured.status = status;
      captured.body = body;
      return true;
    },
  };
}

async function callHistory(path, method = "GET") {
  const { captured, sendJson } = captureSendJson();
  const prev = process.env.ADMIN_DEV_MOCK;
  process.env.ADMIN_DEV_MOCK = "1";
  try {
    await handleAdminApi(
      { method, url: path, headers: {} },
      {},
      path,
      {
        readBody: async () => Buffer.from("{}"),
        sendJson,
      }
    );
  } finally {
    process.env.ADMIN_DEV_MOCK = prev;
  }
  return captured;
}

test("history, restore, and backup APIs reject unauthenticated clients", async () => {
  const list = await callHistory("/api/admin/history");
  assert.equal(list.status, 401);
  assert.equal(list.body?.ok, false);
  const restore = await callHistory("/api/admin/history/restore", "POST");
  assert.equal(restore.status, 401);
  const backup = await callHistory("/api/admin/history/backup", "POST");
  assert.equal(backup.status, 401);
  const usage = await callHistory("/api/admin/usage");
  assert.equal(usage.status, 401);
  assert.equal(usage.body?.ok, false);
  const serialized = JSON.stringify([list.body, restore.body, backup.body, usage.body]);
  assert.equal(serialized.includes("ghp_"), false);
  assert.equal(serialized.includes("GITHUB_TOKEN"), false);
  assert.equal(serialized.includes("OIDC_CLIENT_SECRET"), false);
});
