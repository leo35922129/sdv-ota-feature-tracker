/**
 * Search ranking and keyword highlighting for feature cards.
 * Title/name matches rank above matches in description, tags, or releases.
 */

export function tokenizeSearchQuery(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function haystack(group) {
  const releaseHay = (group.releases || [])
    .map((r) => `${r.version} ${r.releaseDate || ""}`)
    .join(" ");
  return `${group.title || ""} ${group.description || ""} ${(group.categories || []).join(" ")} ${releaseHay}`.toLowerCase();
}

export function featureMatchesSearch(group, rawQuery) {
  const tokens = tokenizeSearchQuery(rawQuery);
  if (!tokens.length) return true;
  const hay = haystack(group);
  return tokens.every((tok) => hay.includes(tok));
}

/** 0 = title equals query, 1 = title starts with query, 2 = title contains all tokens, 3 = other fields only. */
export function titleMatchRank(title, rawQuery) {
  const tokens = tokenizeSearchQuery(rawQuery);
  if (!tokens.length) return 3;
  const t = String(title || "").toLowerCase();
  const phrase = tokens.join(" ");
  if (t === phrase) return 0;
  if (t.startsWith(phrase)) return 1;
  if (tokens.every((tok) => t.includes(tok))) return 2;
  return 3;
}

export function compareSearchResults(a, b, rawQuery) {
  const ra = titleMatchRank(a.title, rawQuery);
  const rb = titleMatchRank(b.title, rawQuery);
  if (ra !== rb) return ra - rb;
  const q = tokenizeSearchQuery(rawQuery).join(" ");
  if (ra <= 2 && q) {
    const ai = String(a.title || "").toLowerCase().indexOf(q);
    const bi = String(b.title || "").toLowerCase().indexOf(q);
    const aIdx = ai < 0 ? Number.POSITIVE_INFINITY : ai;
    const bIdx = bi < 0 ? Number.POSITIVE_INFINITY : bi;
    if (aIdx !== bIdx) return aIdx - bIdx;
  }
  return String(a.title || "").localeCompare(String(b.title || ""));
}

export function rankSearchResults(groups, rawQuery) {
  return [...(groups || [])]
    .filter((g) => featureMatchesSearch(g, rawQuery))
    .sort((a, b) => compareSearchResults(a, b, rawQuery));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightSearchHtml(text, rawQuery) {
  const source = String(text ?? "");
  const tokens = tokenizeSearchQuery(rawQuery).filter((tok) => tok.length >= 2);
  if (!source || !tokens.length) return escapeHtml(source);

  const unique = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  let out = "";
  let last = 0;
  for (const match of source.matchAll(re)) {
    const start = match.index ?? 0;
    out += escapeHtml(source.slice(last, start));
    out += `<mark class="search-hit">${escapeHtml(match[0])}</mark>`;
    last = start + match[0].length;
  }
  out += escapeHtml(source.slice(last));
  return out;
}
