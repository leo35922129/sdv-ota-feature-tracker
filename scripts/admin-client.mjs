/**
 * Browser client for local admin API. Never allowlists emails here.
 */
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAdminSession() {
  try {
    const res = await fetch("/api/admin/session", { cache: "no-store" });
    if (res.status === 404) {
      return { state: "not-configured", session: null };
    }
    const body = await readJson(res);
    if (!body) return { state: "not-configured", session: null };
    if (body.state === "not-configured") {
      return { state: "not-configured", session: null };
    }
    if (body.state === "expired") return { state: "expired", session: null };
    if (body.state === "unauthorized") return { state: "unauthorized", session: null };
    if (body.ok && body.session) return { state: "authenticated", session: body.session };
    return { state: "unauthenticated", session: null };
  } catch {
    return { state: "not-configured", session: null };
  }
}

export async function loginAdminMock() {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adapter: "mock" }),
  });
  const body = await readJson(res);
  if (res.status === 404 || body?.reason === "not-configured") {
    return { ok: false, state: "not-configured", message: "Provider not configured" };
  }
  if (res.status === 403) {
    return { ok: false, state: "unauthorized", message: "Unauthorized" };
  }
  if (!res.ok || !body?.ok) {
    return { ok: false, state: "error", message: body?.message || "Login failed" };
  }
  return { ok: true, state: "authenticated", session: body.session };
}

export async function logoutAdmin() {
  await fetch("/api/admin/logout", { method: "POST" });
}

export async function fetchAdminOverlays() {
  const res = await fetch("/api/admin/overlays", { cache: "no-store" });
  if (res.status === 401) return { ok: false, state: "unauthenticated" };
  if (res.status === 403) return { ok: false, state: "unauthorized" };
  if (!res.ok) return { ok: false, state: "error" };
  return { ok: true, ...(await readJson(res)) };
}

export async function postAdminDecision(payload) {
  const res = await fetch("/api/admin/image-decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ...(await readJson(res)) };
}

export async function postAdminRecommend(payload) {
  const res = await fetch("/api/admin/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ...(await readJson(res)) };
}

export async function postAdminImageSearch(payload) {
  const res = await fetch("/api/admin/image-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ...(await readJson(res)) };
}

export async function postAdminImageGenerate(payload) {
  const res = await fetch("/api/admin/image-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, ...(await readJson(res)) };
}

export async function fetchAdminHistory(params = {}) {
  const query = new URLSearchParams();
  if (params.actorType) query.set("actorType", params.actorType);
  if (params.actionType) query.set("actionType", params.actionType);
  if (params.range) query.set("range", params.range);
  const res = await fetch(`/api/admin/history?${query}`, { cache: "no-store" });
  return { status: res.status, ...(await readJson(res)) };
}

export async function postAdminHistoryRestore(eventId) {
  const res = await fetch("/api/admin/history/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId }),
  });
  return { status: res.status, ...(await readJson(res)) };
}

export async function fetchAdminUsage() {
  const res = await fetch("/api/admin/usage", { cache: "no-store" });
  return { status: res.status, ...(await readJson(res)) };
}

export async function postAdminHistoryBackup(currentVersionLabel) {
  const res = await fetch("/api/admin/history/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idempotencyKey: currentVersionLabel || "" }),
  });
  return { status: res.status, ...(await readJson(res)) };
}
