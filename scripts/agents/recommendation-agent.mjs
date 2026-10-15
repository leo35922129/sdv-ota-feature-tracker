/**
 * Review recommendation agent.
 * Always returns local next-step recommendations from scored review fields.
 * Calls Glean Chat when credentials are present and prepends that answer.
 * Does not invent Glean documents or fake a Glean success.
 */
export const AGENT_VERSION = "review-recommend-v1";

function gleanConfig() {
  const token = process.env.GLEAN_API_TOKEN || process.env.ADMIN_GLEAN_TOKEN || "";
  const endpoint = process.env.ADMIN_GLEAN_ENDPOINT || "";
  const instance = process.env.GLEAN_INSTANCE || "";
  const base =
    process.env.ADMIN_GLEAN_BASE_URL ||
    process.env.GLEAN_BASE_URL ||
    (instance ? `https://${instance}-be.glean.com` : "");
  return { token, endpoint, base: base.replace(/\/$/, "") };
}

export function gleanChatConfigured() {
  const { token, endpoint, base } = gleanConfig();
  return Boolean(endpoint || (token && base));
}

export function recommendationAgentStatus() {
  return gleanChatConfigured() ? "glean" : "local";
}

function gapLabel(key) {
  switch (key) {
    case "image":
      return "a verified feature screenshot";
    case "source_url":
      return "a canonical source URL";
    case "version":
      return "a specific OTA/SOP version";
    case "release_date":
      return "a precise release date";
    case "models":
      return "model applicability";
    case "description":
      return "release-note detail";
    default:
      return String(key || "").replaceAll("_", " ");
  }
}

function featureFromInput(input = {}) {
  return input.feature || input.reviewMetadata || input;
}

export function buildLocalRecommendation(input = {}) {
  const feature = featureFromInput(input);
  const title = feature.title || input.featureId || "This feature";
  const confidence = feature.evidenceConfidence || "unknown";
  const priority = feature.reviewPriority || "medium";
  const missing = Array.isArray(feature.missingEvidence) ? feature.missingEvidence : [];
  const reasons = Array.isArray(feature.reasons) ? feature.reasons : [];
  const category = feature.category || (feature.categories || [])[0] || "";
  const hasImage = Boolean(feature.hasImage);
  const sopOta = feature.sopOta || "";
  const sourceQuality = feature.sourceQuality || "";

  const action =
    priority === "high"
      ? "Engineering follow-up recommended"
      : priority === "medium"
        ? "Monitor and verify"
        : "No urgent follow-up";

  const steps = [];
  if (priority === "high") {
    steps.push("Keep this card in the high-priority queue until the evidence gaps below are closed.");
  } else if (priority === "medium") {
    steps.push("Spot-check on the next review pass; escalate only if a gap would change a competitive readout.");
  } else {
    steps.push("Leave in the catalog; no extra review loop unless the source notes change.");
  }

  if (missing.includes("image") || !hasImage) {
    steps.push(
      "Open Image Review and attach an official screenshot. Do not use generated art as historical evidence."
    );
  }
  if (missing.includes("source_url")) {
    steps.push("Add or verify the canonical Tesla/Rivian release-note URL before citing this card.");
  }
  if (missing.includes("description") || missing.includes("version") || missing.includes("release_date")) {
    steps.push("Fill missing version, date, or description from the source notes. Do not guess.");
  }
  if (missing.includes("models")) {
    steps.push("Confirm which vehicle models actually received this capability.");
  }
  if (sourceQuality === "community" || sourceQuality === "owner_reported") {
    steps.push("Treat owner/community reports as unconfirmed until an official or professional-media source is attached.");
  }
  if (category) {
    steps.push(
      `Compare your own coverage in “${category}” and record gap, parity, or unique Tesla/Rivian behavior.`
    );
  }
  if (confidence === "low") {
    steps.push("Do not treat this card as confirmed competitive fact until evidence confidence is at least medium.");
  }

  const why = reasons
    .slice(0, 3)
    .map((reason) => `• ${reason}`)
    .join("\n");
  const gaps = missing.length ? missing.map((item) => gapLabel(item)).join("; ") : "none flagged";
  const meta = [sopOta && `${sopOta} card`, `evidence ${confidence}`, `priority ${priority}`]
    .filter(Boolean)
    .join(" · ");

  return [
    `${action} for ${title}.`,
    meta,
    why ? `Why it was flagged:\n${why}` : "",
    `Gaps: ${gaps}.`,
    `Recommended next steps:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildPrompt(input = {}) {
  const feature = featureFromInput(input);
  const title = feature.title || input.featureId || "Unknown feature";
  const description = feature.description || "";
  const category = feature.category || (feature.categories || []).join(", ") || "";
  const confidence = feature.evidenceConfidence || "";
  const priority = feature.reviewPriority || "";
  const reasons = Array.isArray(feature.reasons) ? feature.reasons.join("; ") : "";
  return [
    "You are helping review a competitor SDV OTA feature card for personal competitive research.",
    "Recommend whether this card needs follow-up, and cite known context if you have it.",
    "If you do not have matching sources, say so. Do not invent documents.",
    `Feature: ${title}`,
    category ? `Category: ${category}` : "",
    description ? `Description: ${description}` : "",
    confidence ? `Evidence confidence: ${confidence}` : "",
    priority ? `Review priority: ${priority}` : "",
    reasons ? `Why review: ${reasons}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function textFromGleanChat(data) {
  const messages = data?.messages || data?.chat?.messages || [];
  const parts = [];
  for (const msg of messages) {
    const author = String(msg.author || msg.sender || "").toUpperCase();
    if (author && author !== "GLEAN" && author !== "ASSISTANT") continue;
    for (const frag of msg.fragments || []) {
      if (typeof frag.text === "string" && frag.text.trim()) parts.push(frag.text.trim());
    }
  }
  if (parts.length) return parts.join("\n");
  if (typeof data?.message === "string") return data.message;
  return "";
}

async function postJson(url, body, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function gleanRecommendation(input = {}) {
  const { token, endpoint, base } = gleanConfig();
  if (!endpoint && !(token && base)) return null;

  const prompt = buildPrompt(input);
  try {
    const result = endpoint
      ? await postJson(endpoint, { ...input, prompt, agent: "glean" }, token ? { Authorization: `Bearer ${token}` } : {})
      : await postJson(
          `${base}/rest/api/v1/chat`,
          {
            stream: false,
            messages: [
              {
                author: "USER",
                fragments: [{ text: prompt }],
                agentConfig: { agent: "DEFAULT" },
              },
            ],
          },
          { Authorization: `Bearer ${token}` }
        );

    if (!result.ok) {
      return {
        ok: false,
        message: result.data?.message || `Glean request failed (${result.status})`,
      };
    }

    const message = textFromGleanChat(result.data) || result.data.message || "";
    if (!message) {
      return { ok: false, message: "Glean returned no recommendation text." };
    }
    return { ok: true, message };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return { ok: false, message: aborted ? "Glean request timed out." : "Glean request failed." };
  }
}

export async function recommend(input = {}) {
  const localMessage = buildLocalRecommendation(input);
  const glean = await gleanRecommendation(input);
  if (glean?.ok) {
    return {
      ok: true,
      state: "success",
      agent: "glean",
      message: `${glean.message}\n\nLocal review next steps:\n${localMessage}`,
    };
  }

  const suffix = glean
    ? `\n\nGlean Chat: ${glean.message}`
    : "";
  return {
    ok: true,
    state: "success",
    agent: "local-review",
    message: localMessage + suffix,
  };
}
