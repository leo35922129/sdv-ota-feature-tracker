#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEmailAllowed,
  isMockAuthEnabled,
  authMode,
  createAdminSession,
  verifySession,
  loginWithMockAdapter,
  signSession,
} from "./admin-auth.mjs";

test("allowlist is server-side and rejects unknown emails", () => {
  assert.equal(isEmailAllowed("lei@localhost"), true);
  assert.equal(isEmailAllowed("other@example.com"), false);
  assert.equal(isEmailAllowed(""), false);
});

test("mock adapter is off unless ADMIN_DEV_MOCK=1", () => {
  const prev = process.env.ADMIN_DEV_MOCK;
  process.env.ADMIN_DEV_MOCK = "";
  assert.equal(isMockAuthEnabled(), false);
  const denied = loginWithMockAdapter();
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "not-configured");
  process.env.ADMIN_DEV_MOCK = "1";
  assert.equal(authMode(), "mock");
  const ok = loginWithMockAdapter();
  assert.equal(ok.ok, true);
  assert.equal(ok.session.email, "lei@localhost");
  process.env.ADMIN_DEV_MOCK = prev;
});

test("session signature expires and rejects tampering", () => {
  const prevMock = process.env.ADMIN_DEV_MOCK;
  const prevSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_DEV_MOCK = "1";
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  const created = createAdminSession({
    email: "lei@localhost",
    name: "Lei Zhang",
  });
  assert.equal(created.ok, true);
  assert.equal(verifySession(created.token).ok, true);
  const tampered = created.token.replace(/\./, ".x");
  assert.equal(verifySession(tampered).ok, false);
  const expired = signSession({
    email: "lei@localhost",
    name: "Lei Zhang",
    role: "admin",
    exp: Date.now() - 1000,
  });
  assert.equal(verifySession(expired).reason, "expired");
  process.env.ADMIN_DEV_MOCK = prevMock;
  process.env.ADMIN_SESSION_SECRET = prevSecret;
});
