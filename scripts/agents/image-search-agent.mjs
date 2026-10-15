/**
 * Typed image-search / backup-generation adapter.
 * v1 has no live search backend. Unconfigured must not fake candidates.
 */
export function imageSearchAgentStatus() {
  if (process.env.ADMIN_IMAGE_AGENT_ENDPOINT) return "configured";
  return "not-configured";
}

export async function findCandidates(_input) {
  return {
    ok: false,
    state: "not-configured",
    message: "Agent not configured",
    candidates: [],
  };
}

export async function generateBackup(_input) {
  return {
    ok: false,
    state: "not-configured",
    message: "Agent not configured",
  };
}
