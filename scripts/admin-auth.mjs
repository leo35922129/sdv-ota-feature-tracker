/**
 * Admin auth adapter for local v1.
 *
 * Optional production path: OIDC (server-side allowlist + client secret).
 * Static hosting / GitHub Pages: no server → provider-not-configured.
 * Local mock: only when ADMIN_DEV_MOCK=1. Never treat mock as production security.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_ALLOWLIST = (
  process.env.ADMIN_ALLOWLIST || "lei@localhost"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const MOCK_ADMIN = {
  sub: "local-mock-lei",
  email: "lei@localhost",
  name: "Lei Zhang",
  role: "admin",
};

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const COOKIE_NAME = "sdv_admin_session";

export function isMockAuthEnabled() {
  return process.env.ADMIN_DEV_MOCK === "1";
}

export function oidcConfigured() {
  return Boolean(
    process.env.OIDC_ISSUER &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET
  );
}

export function authMode() {
  if (oidcConfigured()) return "oidc";
  if (isMockAuthEnabled()) return "mock";
  return "not-configured";
}

export function isEmailAllowed(email) {
  const key = String(email || "").trim().toLowerCase();
  return Boolean(key) && ADMIN_ALLOWLIST.includes(key);
}

function sessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    (isMockAuthEnabled() ? "dev-only-mock-session-secret" : "")
  );
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signSession(payload, secret = sessionSecret()) {
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token, secret = sessionSecret()) {
  if (!token || !secret) return { ok: false, reason: "missing" };
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload?.exp || Date.now() > payload.exp) {
    return { ok: false, reason: "expired" };
  }
  if (payload.role !== "admin" || !isEmailAllowed(payload.email)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true, session: payload };
}

export function createAdminSession(identity) {
  if (!isEmailAllowed(identity?.email)) {
    return { ok: false, reason: "unauthorized" };
  }
  const now = Date.now();
  const payload = {
    sub: identity.sub || identity.email,
    email: String(identity.email).trim().toLowerCase(),
    name: identity.name || identity.email,
    role: "admin",
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return { ok: true, token: signSession(payload), session: payload };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie);
  return verifySession(cookies[COOKIE_NAME]);
}

export function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export function publicSessionView(session) {
  if (!session) return null;
  return {
    name: session.name,
    email: session.email,
    role: session.role,
    exp: session.exp,
    mock: isMockAuthEnabled() && !oidcConfigured(),
  };
}

export function loginWithMockAdapter() {
  if (!isMockAuthEnabled()) {
    return { ok: false, reason: "not-configured" };
  }
  return createAdminSession(MOCK_ADMIN);
}

/**
 * Typed production adapter surface. v1 documents OIDC; it is not wired
 * until OIDC_* env vars are provided to the local server.
 */
export function oidcAuthorizationUrl() {
  if (!oidcConfigured()) return { ok: false, reason: "not-configured" };
  return {
    ok: false,
    reason: "not-configured",
    message:
      "OIDC adapter is typed but not completed in v1. Use ADMIN_DEV_MOCK=1 locally.",
  };
}
