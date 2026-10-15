/**
 * Authenticated admin API. Not available on GitHub Pages.
 */
import {
  authMode,
  clearSessionCookie,
  loginWithMockAdapter,
  publicSessionView,
  sessionFromRequest,
  setSessionCookie,
} from "./admin-auth.mjs";
import {
  addCandidates,
  appendRecommendation,
  candidatesForFeature,
  loadCandidatesDoc,
  loadDecisionsDoc,
  loadRecommendationsDoc,
  upsertDecision,
} from "./admin-store.mjs";
import { recommend, recommendationAgentStatus, AGENT_VERSION } from "./agents/recommendation-agent.mjs";
import {
  findCandidates,
  generateBackup,
  imageSearchAgentStatus,
} from "./agents/image-search-agent.mjs";
import { productionImageFromDecision } from "./image-review.mjs";
import { upsertEdits, loadEditsDoc } from "./feature-edits.mjs";
import { defaultHistoryStore, publicHistoryEvent } from "./dev-history.mjs";
import { backupCurrentVersion } from "./dev-history-backup.mjs";
import { collectUsageReport } from "./dev-usage.mjs";

function requireAdmin(req, res, sendJson) {
  const mode = authMode();
  if (mode === "not-configured") {
    sendJson(res, 503, { ok: false, state: "not-configured", reason: "not-configured" });
    return null;
  }
  const verified = sessionFromRequest(req);
  if (verified.reason === "expired") {
    sendJson(res, 401, { ok: false, state: "expired", reason: "expired" });
    return null;
  }
  if (verified.reason === "unauthorized") {
    sendJson(res, 403, { ok: false, state: "unauthorized", reason: "unauthorized" });
    return null;
  }
  if (!verified.ok) {
    sendJson(res, 401, { ok: false, state: "unauthenticated", reason: "unauthenticated" });
    return null;
  }
  return verified.session;
}

function applyProductionImages(featureIds, brand, assignment) {
  if (!featureIds?.length) return { ok: true };
  if (assignment.reason !== "approved" || !assignment.image) {
    return { ok: true, skipped: true };
  }
  return upsertEdits(
    {
      ids: featureIds,
      image: assignment.image,
      imageDark: assignment.imageDark || "",
    },
    { brand }
  );
}

export async function handleAdminApi(req, res, urlPath, { readBody, sendJson }) {
  if (!urlPath.startsWith("/api/admin")) return false;

  if (urlPath === "/api/admin/session" && req.method === "GET") {
    const mode = authMode();
    if (mode === "not-configured") {
      return sendJson(res, 200, { ok: false, state: "not-configured" });
    }
    const verified = sessionFromRequest(req);
    if (verified.reason === "expired") {
      return sendJson(res, 200, { ok: false, state: "expired" });
    }
    if (verified.reason === "unauthorized") {
      return sendJson(res, 200, { ok: false, state: "unauthorized" });
    }
    if (!verified.ok) {
      return sendJson(res, 200, { ok: false, state: "unauthenticated" });
    }
    return sendJson(res, 200, {
      ok: true,
      state: "authenticated",
      session: publicSessionView(verified.session),
    });
  }

  if (urlPath === "/api/admin/login" && req.method === "POST") {
    const mode = authMode();
    if (mode === "not-configured") {
      return sendJson(res, 503, {
        ok: false,
        state: "not-configured",
        reason: "not-configured",
        message: "Provider not configured",
      });
    }
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    if (payload.adapter !== "mock" || mode !== "mock") {
      return sendJson(res, 503, {
        ok: false,
        state: "not-configured",
        reason: "not-configured",
        message: "SSO/OIDC is not configured for this server",
      });
    }
    const result = loginWithMockAdapter();
    if (!result.ok) {
      const status = result.reason === "unauthorized" ? 403 : 503;
      return sendJson(res, status, {
        ok: false,
        state: result.reason,
        reason: result.reason,
      });
    }
    setSessionCookie(res, result.token);
    return sendJson(res, 200, {
      ok: true,
      state: "authenticated",
      session: publicSessionView(result.session),
    });
  }

  if (urlPath === "/api/admin/logout" && req.method === "POST") {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true, state: "unauthenticated" });
  }

  const session = requireAdmin(req, res, sendJson);
  if (!session) return true;

  if (urlPath === "/api/admin/overlays" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      candidates: loadCandidatesDoc().candidates,
      decisions: loadDecisionsDoc().decisions,
      recommendations: loadRecommendationsDoc().items,
    });
  }

  if (urlPath === "/api/admin/image-decision" && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    const featureId = String(payload.featureId || "");
    if (!featureId) {
      return sendJson(res, 400, { ok: false, errors: ["featureId is required"] });
    }
    const decision = upsertDecision({
      featureId,
      primaryCandidate: payload.primaryCandidate || undefined,
      secondaryCandidate: payload.secondaryCandidate || undefined,
      status: payload.status || "needs-review",
      reviewer: session.email,
      reviewedAt: new Date().toISOString(),
      notes: payload.notes || undefined,
    });
    const candidates = candidatesForFeature(featureId);
    const assignment = productionImageFromDecision(candidates, decision);
    const ids = Array.isArray(payload.featureIds) && payload.featureIds.length
      ? payload.featureIds
      : [featureId];
    const brand = payload.brand === "rivian" ? "rivian" : "tesla";
    const edited = applyProductionImages(ids, brand, assignment);
    defaultHistoryStore.recordEvent({
      actorType: "user",
      actorId: session.email,
      actorName: session.name || session.email,
      source: "user",
      actionType: "image_decision",
      title: "Image review decision",
      summary: `Set ${featureId} to ${decision.status}.`,
      changedAreas: ["data/admin/image-decisions.json", "data/feature-edits.json"],
      snapshot: loadEditsDoc(),
    });
    return sendJson(res, 200, {
      ok: true,
      decision,
      assignment,
      edits: edited?.ok ? edited.edits : undefined,
      warnings: edited?.validation?.warnings,
    });
  }

  if (urlPath === "/api/admin/recommend" && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    const result = await recommend(payload);
    if (result.ok) {
      appendRecommendation({
        featureId: payload.featureId,
        agentVersion: AGENT_VERSION,
        createdAt: new Date().toISOString(),
        reviewer: session.email,
        result,
      });
    }
    return sendJson(res, result.ok ? 200 : 200, {
      ...result,
      agentStatus: recommendationAgentStatus(),
    });
  }

  if (urlPath === "/api/admin/image-search" && req.method === "POST") {
    const result = await findCandidates({});
    if (result.ok && result.candidates?.length) addCandidates(result.candidates);
    return sendJson(res, 200, {
      ...result,
      agentStatus: imageSearchAgentStatus(),
    });
  }

  if (urlPath === "/api/admin/image-generate" && req.method === "POST") {
    const result = await generateBackup({});
    return sendJson(res, 200, {
      ...result,
      agentStatus: imageSearchAgentStatus(),
    });
  }

  if (urlPath === "/api/admin/history" && req.method === "GET") {
    const query = new URL(req.url || "/", "http://127.0.0.1").searchParams;
    const result = defaultHistoryStore.listHistory({
      actorType: query.get("actorType") || "all",
      actionType: query.get("actionType") || "all",
      range: query.get("range") || "all",
    });
    return sendJson(res, 200, result);
  }

  if (urlPath === "/api/admin/history/backup-status" && req.method === "GET") {
    const listed = defaultHistoryStore.listHistory({ page: 1, pageSize: 1 });
    const current = defaultHistoryStore
      .loadDoc()
      .events.find((item) => item.id === listed.currentEventId);
    return sendJson(res, 200, {
      ok: true,
      currentEventId: listed.currentEventId,
      currentVersionLabel: listed.currentVersionLabel,
      backupStatus: current?.backupStatus || "none",
      backupCommitSha: current?.backupCommitSha || null,
      backupUrl: current?.backupUrl || null,
    });
  }

  if (urlPath === "/api/admin/history/restore" && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, errors: ["Invalid JSON body"] });
    }
    const eventId = String(payload.eventId || "");
    if (!eventId) {
      return sendJson(res, 400, { ok: false, errors: ["eventId is required"] });
    }
    try {
      const result = await defaultHistoryStore.restoreEvent(eventId, {
        email: session.email,
        actorName: session.name || session.email,
      });
      return sendJson(res, result.ok ? 200 : 409, result);
    } catch (err) {
      const busy = err.code === "busy";
      return sendJson(res, busy ? 409 : 500, {
        ok: false,
        state: busy ? "busy" : "error",
        message: err.message || "Restore failed",
      });
    }
  }

  if (urlPath === "/api/admin/history/backup" && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    } catch {
      payload = {};
    }
    try {
      const result = await backupCurrentVersion({
        store: defaultHistoryStore,
        actor: { email: session.email, actorName: session.name || session.email },
      });
      const idempotencyKey = String(payload.idempotencyKey || "");
      const currentLabel = defaultHistoryStore.listHistory({ pageSize: 1 }).currentVersionLabel;
      if (idempotencyKey && currentLabel && idempotencyKey !== currentLabel && result.state !== "already-backed-up") {
        // Client key is advisory only; the server always backs up the live current version.
      }
      return sendJson(res, result.ok ? 200 : result.state === "unavailable" ? 503 : 500, {
        ...result,
        event: result.event ? publicHistoryEvent(result.event) : undefined,
      });
    } catch (err) {
      const busy = err.code === "busy";
      return sendJson(res, busy ? 409 : 500, {
        ok: false,
        state: busy ? "busy" : "error",
        message: err.message || "Backup failed",
      });
    }
  }

  if (urlPath === "/api/admin/usage" && req.method === "GET") {
    try {
      return sendJson(res, 200, collectUsageReport());
    } catch {
      return sendJson(res, 500, {
        ok: false,
        state: "error",
        message: "Could not build the development usage report.",
      });
    }
  }

  sendJson(res, 404, { ok: false, errors: ["Unknown admin route"] });
  return true;
}
