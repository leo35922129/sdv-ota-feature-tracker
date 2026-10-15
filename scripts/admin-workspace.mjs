/**
 * Admin workspace HTML helpers. Browser-safe. Does not duplicate feature cards.
 */
import {
  compareReviewRows,
  summarizeReview,
} from "./feature-review.mjs";
import { capCandidates, compareImageReviewItems } from "./image-review.mjs";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function filterReviewRows(rows, extra) {
  const conf = extra.confidence || "all";
  const prio = extra.priority || "all";
  const image = extra.imageStatus || "all";
  const source = extra.sourceType || "all";
  const sop = extra.sopOta || "all";
  return rows.filter((row) => {
    if (conf !== "all" && row.evidenceConfidence !== conf) return false;
    if (prio !== "all" && row.reviewPriority !== prio) return false;
    if (source !== "all" && row.sourceQuality !== source) return false;
    if (sop !== "all" && row.sopOta !== sop) return false;
    if (image === "missing" && row.hasImage) return false;
    if (image === "present" && !row.hasImage) return false;
    return true;
  });
}

function versionDateCell(row) {
  const version = String(row.version || "").trim();
  const date = String(row.releaseDate || "").trim();
  if (!version && !date) return "—";
  if (!date || version.toLowerCase().includes(date.toLowerCase())) {
    return escapeHtml(version || date);
  }
  return `${escapeHtml(version)}<span class="admin-muted">${escapeHtml(date)}</span>`;
}

function metric(label, value, extraClass = "") {
  const className = extraClass ? `admin-metric ${extraClass}` : "admin-metric";
  return `<div class="${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function extraFiltersHtml(prefix, extra, options) {
  const select = (name, label, items) => `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select data-admin-filter="${escapeHtml(name)}" aria-label="${escapeHtml(label)}">
        ${items
          .map(
            ([v, l]) =>
              `<option value="${escapeHtml(v)}" ${extra[name] === v ? "selected" : ""}>${escapeHtml(l)}</option>`
          )
          .join("")}
      </select>
    </label>`;
  return `
    <div class="admin-extra-filters" role="group" aria-label="${escapeHtml(prefix)} filters">
      ${options.map((o) => select(o.name, o.label, o.items)).join("")}
    </div>`;
}

export function renderDevelopmentReportHtml({
  rows,
  extra,
  agentStateById = {},
}) {
  const filtered = filterReviewRows(rows, extra).sort(compareReviewRows);
  const summary = summarizeReview(filtered);
  const body = filtered
    .map((row) => {
      const agent = agentStateById[row.id] || { state: "idle" };
      const showAgent =
        row.evidenceConfidence === "low" || row.reviewPriority === "high";
      const agentBusy = agent.state === "loading";
      const agentOpen = Boolean(agent.open);
      const agentLabel = agentBusy
        ? "Loading Glean recommendations"
        : agentOpen
          ? "Close Glean recommendations"
          : "Open Glean recommendations";
      const panelId = `glean-panel-${row.id}`;
      const panelText = agentBusy
        ? "Loading recommendations…"
        : agent.message || "No recommendation yet.";
      return `
        <tbody class="admin-report-group${agentOpen ? " is-open" : ""}">
          <tr>
            <td class="admin-feature-cell"><button type="button" class="admin-feature-link" data-open-feature="${escapeHtml(row.id)}">${escapeHtml(row.title)}</button></td>
            <td class="admin-models-cell">${escapeHtml((row.models || []).join(", ") || "—")}</td>
            <td>${escapeHtml(row.sopOta)}</td>
            <td class="admin-version-cell">${versionDateCell(row)}</td>
            <td>${escapeHtml(row.category || "—")}</td>
            <td><span class="admin-pill is-${escapeHtml(row.evidenceConfidence)}">${escapeHtml(row.evidenceConfidence)} · ${row.score}</span></td>
            <td><span class="admin-pill is-${escapeHtml(row.reviewPriority)}">${escapeHtml(row.reviewPriority)}</span></td>
            <td class="admin-reason">${escapeHtml(row.reasons[0] || "")}${
              row.missingEvidence?.length
                ? `<div class="admin-muted">Missing: ${escapeHtml(row.missingEvidence.join(", "))}</div>`
                : ""
            }</td>
            <td>${row.hasImage ? "Has image" : "Missing"}</td>
            <td>${escapeHtml(row.sourceQuality)}</td>
            <td>
              ${
                showAgent
                  ? `<button type="button" class="admin-agent-btn${agentOpen ? " is-open" : ""}${agentBusy ? " is-loading" : ""}" data-recommend="${escapeHtml(row.id)}" aria-expanded="${agentOpen}" aria-controls="${escapeHtml(panelId)}" aria-label="${escapeHtml(agentLabel)} for ${escapeHtml(row.title)}" title="${escapeHtml(agentLabel)}"><img class="glean-logo" src="./assets/glean-logo.png" alt="" width="28" height="28" /><span class="visually-hidden">${escapeHtml(agentLabel)}</span></button>`
                  : ""
              }
            </td>
          </tr>
          ${
            showAgent
              ? `<tr class="admin-agent-panel-row${agentOpen ? " is-open" : ""}">
            <td colspan="11">
              <div class="admin-agent-panel" id="${escapeHtml(panelId)}" ${agentOpen ? "" : "hidden"}>
                <h3 class="admin-agent-panel-title">Glean recommended solutions</h3>
                <p class="admin-agent-result">${escapeHtml(panelText)}</p>
              </div>
            </td>
          </tr>`
              : ""
          }
        </tbody>`;
    })
    .join("");

  return `
    <div class="admin-workspace-body">
      <div class="admin-metrics" aria-label="Development report summary">
        ${metric("Evaluated", summary.evaluated)}
        ${metric("High confidence", summary.highConfidence)}
        ${metric("Medium confidence", summary.mediumConfidence)}
        ${metric("Low confidence", summary.lowConfidence)}
        ${metric("High-priority queue", summary.highPriority)}
        ${metric("Missing images", summary.missingImage)}
        ${metric("Source / licensing concerns", summary.sourceConcerns)}
      </div>
      ${extraFiltersHtml("Development report", extra, [
        {
          name: "sopOta",
          label: "SOP / OTA",
          items: [
            ["all", "All types"],
            ["SOP", "SOP"],
            ["OTA", "OTA"],
          ],
        },
        {
          name: "confidence",
          label: "Confidence",
          items: [
            ["all", "All confidence"],
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"],
          ],
        },
        {
          name: "priority",
          label: "Review priority",
          items: [
            ["all", "All priorities"],
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"],
          ],
        },
        {
          name: "imageStatus",
          label: "Image status",
          items: [
            ["all", "All images"],
            ["missing", "Missing"],
            ["present", "Has image"],
          ],
        },
        {
          name: "sourceType",
          label: "Source type",
          items: [
            ["all", "All sources"],
            ["official", "Official"],
            ["manual", "Manual"],
            ["professional_media", "Professional media"],
            ["community", "Community"],
            ["owner_reported", "Owner-reported"],
            ["unknown", "Unknown"],
          ],
        },
      ])}
      <div class="admin-table-wrap" role="region" aria-label="Development report" tabindex="0">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Models</th>
              <th>Type</th>
              <th>Version / date</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>Priority</th>
              <th>Why review</th>
              <th>Image</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          ${body || `<tbody><tr><td colspan="11">No records match these filters.</td></tr></tbody>`}
        </table>
      </div>
    </div>`;
}

export function renderImageReviewHtml({ items, extra, sort, selectedIds }) {
  const selected = new Set(selectedIds || []);
  let rows = items.filter((item) => {
    if (extra.sourceType && extra.sourceType !== "all") {
      const types = (item.candidates || []).map((c) => c.sourceType);
      if (types.length && !types.includes(extra.sourceType)) return false;
    }
    if (extra.evidenceLevel && extra.evidenceLevel !== "all") {
      if (!(item.candidates || []).some((c) => c.evidenceLevel === extra.evidenceLevel)) {
        return false;
      }
    }
    if (extra.confidence && extra.confidence !== "all") {
      if (item.evidenceConfidence !== extra.confidence) return false;
    }
    if (extra.generated === "generated") {
      if (!(item.candidates || []).some((c) => c.generated)) return false;
    }
    if (extra.generated === "real") {
      if ((item.candidates || []).some((c) => c.generated) && !(item.candidates || []).some((c) => !c.generated)) {
        return false;
      }
    }
    if (extra.reviewStatus && extra.reviewStatus !== "all") {
      const st = item.decision?.status || "needs-review";
      if (st !== extra.reviewStatus) return false;
    }
    if (extra.missingDecisions === "missing" && item.decision) return false;
    return true;
  });
  rows = [...rows].sort((a, b) => compareImageReviewItems(a, b, sort));

  const cards = rows
    .map((item) => {
      const cands = capCandidates(item.candidates || []);
      const candHtml =
        cands.length === 0
          ? `<p class="admin-muted">No candidates yet. Use Search again when an image agent is configured.</p>`
          : cands
              .map((c, idx) => {
                const src = c.imageUrl || c.imagePath || "";
                const preview = src
                  ? `<img src="${escapeHtml(src)}" alt="" />`
                  : `<div class="admin-image-empty">No preview</div>`;
                const gen = c.generated
                  ? `<span class="admin-pill is-low">Conceptual only · generated</span>`
                  : "";
                return `
                  <figure class="admin-candidate" data-candidate="${escapeHtml(c.candidateId)}">
                    <div class="admin-candidate-preview">${preview}</div>
                    <figcaption>
                      <strong>${idx + 1}. ${escapeHtml(c.sourceType)}</strong>
                      ${gen}
                      <div class="admin-muted">${escapeHtml(c.evidenceLevel || "")} · ${escapeHtml(c.confidence)} · ${escapeHtml(c.licenseStatus || "license unknown")}</div>
                      <p>${escapeHtml(c.rationale || "")}</p>
                      ${c.sourceUrl ? `<a href="${escapeHtml(c.sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ""}
                      ${c.credit ? `<div class="admin-muted">Credit: ${escapeHtml(c.credit)}</div>` : ""}
                    </figcaption>
                  </figure>`;
              })
              .join("");
      return `
        <article class="admin-image-card" data-feature-id="${escapeHtml(item.id)}" tabindex="0">
          <header class="admin-image-card-head">
            <label class="admin-check">
              <input type="checkbox" data-select-feature="${escapeHtml(item.id)}" ${selected.has(item.id) ? "checked" : ""} />
              <span class="visually-hidden">Select ${escapeHtml(item.title)}</span>
            </label>
            <div>
              <h3><button type="button" class="admin-feature-link" data-open-feature="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button></h3>
              <p class="admin-muted">${escapeHtml(item.brand)} · ${escapeHtml((item.models || []).join(" ") || "—")} · ${escapeHtml(item.category || "—")} · ${escapeHtml(item.version || "")}</p>
            </div>
          </header>
          <div class="admin-candidate-row">${candHtml}</div>
          <div class="admin-image-actions">
            <button type="button" data-image-action="primary">Use as Primary</button>
            <button type="button" data-image-action="secondary">Use as Secondary</button>
            <button type="button" data-image-action="reject">Reject</button>
            <button type="button" data-image-action="placeholder">Use Placeholder</button>
            <button type="button" data-image-action="needs-review">Needs Review</button>
            <button type="button" data-image-action="search">Search Again</button>
            <button type="button" data-image-action="generate">Generate Backup</button>
          </div>
          <p class="admin-live" data-live="${escapeHtml(item.id)}" aria-live="polite"></p>
        </article>`;
    })
    .join("");

  return `
    <div class="admin-workspace-body">
      ${extraFiltersHtml("Image review", extra, [
        {
          name: "sourceType",
          label: "Source type",
          items: [
            ["all", "All sources"],
            ["official", "Official"],
            ["professional_media", "Professional media"],
            ["community", "Community"],
            ["generated", "Generated"],
            ["placeholder", "Placeholder"],
          ],
        },
        {
          name: "evidenceLevel",
          label: "Evidence level",
          items: [
            ["all", "All evidence"],
            ["direct_feature_evidence", "Direct"],
            ["contextual_evidence", "Contextual"],
            ["conceptual_only", "Conceptual"],
            ["unverified", "Unverified"],
          ],
        },
        {
          name: "confidence",
          label: "Confidence",
          items: [
            ["all", "All confidence"],
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"],
          ],
        },
        {
          name: "generated",
          label: "Generated vs real",
          items: [
            ["all", "All images"],
            ["real", "Real"],
            ["generated", "Generated"],
          ],
        },
        {
          name: "reviewStatus",
          label: "Review status",
          items: [
            ["all", "All statuses"],
            ["needs-review", "Needs review"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["placeholder", "Placeholder"],
          ],
        },
      ])}
      <div class="admin-image-toolbar">
        <label class="field">
          <span>Sort</span>
          <select data-admin-sort>
            <option value="needs-review" ${sort === "needs-review" ? "selected" : ""}>Needs review first</option>
            <option value="confidence" ${sort === "confidence" ? "selected" : ""}>Lowest confidence</option>
            <option value="name" ${sort === "name" ? "selected" : ""}>Feature name</option>
            <option value="category" ${sort === "category" ? "selected" : ""}>Category</option>
          </select>
        </label>
        <button type="button" class="btn-text" data-batch="placeholder" ${selected.size ? "" : "disabled"}>Placeholder selected (${selected.size})</button>
      </div>
      <div class="admin-image-grid">${cards || `<p class="empty">No image-review rows match these filters.</p>`}</div>
    </div>`;
}

function formatHistoryTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escapeHtml(iso);
  return escapeHtml(date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC"));
}

function historyBackupStatusHtml(backupState = {}) {
  if (!backupState.message) return "";
  const sha = backupState.commitSha;
  const url = backupState.backupUrl;
  return `<p class="admin-workspace-backup-status" role="status">${escapeHtml(backupState.message)}${
    sha
      ? url
        ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(
            String(sha).slice(0, 7)
          )}</a>`
        : ` · ${escapeHtml(String(sha).slice(0, 7))}`
      : ""
  }</p>`;
}

function historyBackupButtonHtml(backupState = {}, restoreState = {}) {
  const backupBusy = backupState.state === "loading";
  const restoreBusy = restoreState.state === "loading";
  const backupLabel = backupBusy ? "Backing up…" : "Backup to GitHub";
  return `<button type="button" class="admin-backup-btn" data-history-backup ${
    backupBusy || restoreBusy ? "disabled" : ""
  } aria-busy="${backupBusy ? "true" : "false"}" aria-label="Backup current version to GitHub">${backupLabel}</button>`;
}

export function renderDevelopmentHistoryHtml({
  extra = {},
  page = {},
  backupState = {},
  restoreState = {},
} = {}) {
  const items = page.items || [];
  const body = items
    .map((event) => {
      const current = Boolean(event.isCurrent);
      const restoreBusy = restoreState.state === "loading";
      const canUndo = Boolean(event.undoable) && !current && !restoreBusy;
      const actor = event.actorType === "user" ? "user" : "system";
      const status = current
        ? "current"
        : event.backupStatus === "backed_up"
          ? "backed-up"
          : event.source === "undo"
            ? "restored"
            : "recorded";
      const areas = (event.changedAreas || []).join(", ") || "—";
      return `
        <tr>
          <td><span class="admin-mono">${escapeHtml(event.versionLabel || "—")}</span>${
            current ? ` <span class="admin-pill is-high">Current</span>` : ""
          }</td>
          <td>${formatHistoryTime(event.createdAt)}</td>
          <td><span class="admin-pill is-${actor === "user" ? "medium" : "low"}">${escapeHtml(actor)}</span></td>
          <td>${escapeHtml(event.title || event.actionType || "—")}</td>
          <td class="admin-reason">${escapeHtml(event.summary || "")}</td>
          <td class="admin-reason">${escapeHtml(areas)}</td>
          <td><span class="admin-pill">${escapeHtml(status)}</span></td>
          <td>
            <button type="button" class="admin-history-undo" data-history-undo="${escapeHtml(event.id)}" ${
              canUndo ? "" : "disabled"
            } aria-disabled="${canUndo ? "false" : "true"}" aria-label="Undo to ${escapeHtml(
              event.versionLabel || "this version"
            )}">Undo</button>
            <details class="admin-history-details">
              <summary>View details</summary>
              <p>Action: ${escapeHtml(event.actionType || "—")}</p>
              <p>Source: ${escapeHtml(event.source || "—")}</p>
              <p>Actor: ${escapeHtml(event.actorName || event.actorId || "—")}</p>
              ${
                event.backupCommitSha
                  ? `<p>Backup: ${
                      event.backupUrl
                        ? `<a href="${escapeHtml(event.backupUrl)}" target="_blank" rel="noopener">${escapeHtml(
                            event.backupCommitSha.slice(0, 7)
                          )}</a>`
                        : escapeHtml(event.backupCommitSha.slice(0, 7))
                    }</p>`
                  : ""
              }
            </details>
          </td>
        </tr>`;
    })
    .join("");

  const statusLine = (message, extra = {}) => {
    if (!message) return "";
    const sha = extra.commitSha;
    const url = extra.backupUrl;
    return `<p class="admin-history-backup-status" role="status">${escapeHtml(message)}${
      sha
        ? url
          ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(
              String(sha).slice(0, 7)
            )}</a>`
          : ` · ${escapeHtml(String(sha).slice(0, 7))}`
        : ""
    }</p>`;
  };
  const statusNote = statusLine(restoreState.message);

  return `
    <div class="admin-workspace-body admin-history-body">
      ${statusNote}
      ${extraFiltersHtml("Development history", extra, [
        {
          name: "actorType",
          label: "Actor",
          items: [
            ["all", "All"],
            ["system", "System"],
            ["user", "User"],
          ],
        },
        {
          name: "actionType",
          label: "Action",
          items: [
            ["all", "All actions"],
            ["design_edit", "Design edit"],
            ["image_decision", "Image decision"],
            ["source_sync", "Source sync"],
            ["undo", "Undo"],
            ["github_backup", "GitHub backup"],
          ],
        },
        {
          name: "range",
          label: "Time range",
          items: [
            ["all", "All time"],
            ["24h", "Last 24 hours"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
          ],
        },
      ])}
      <div class="admin-table-wrap" role="region" aria-label="Development history" tabindex="0">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Description</th>
              <th>Affected</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${
            body ||
            `<tr><td colspan="8">No history entries match these filters.</td></tr>`
          }</tbody>
        </table>
      </div>
    </div>`;
}

function formatUsageInstant(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}

function formatUsageCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function usageNoteHtml(report) {
  const note = report?.sourceNote || "";
  if (!note) return "";
  return `<p class="admin-muted admin-usage-note">${escapeHtml(note)}</p>`;
}

function usageLoadingHtml(label) {
  return `
    <div class="admin-workspace-body admin-usage-body">
      <p class="admin-muted">${escapeHtml(label)}</p>
    </div>`;
}

export function renderDevelopmentTimeHtml({ report } = {}) {
  if (!report) return usageLoadingHtml("Loading development time…");
  if (!report.ok) {
    return usageLoadingHtml(report.message || "Could not load development time.");
  }
  const time = report.time || {};
  const rows = (time.byDay || [])
    .map(
      (day) => `
        <tr>
          <td><time datetime="${escapeHtml(day.date)}">${escapeHtml(day.date)}</time></td>
          <td>${escapeHtml(day.activeLabel || "0m")}</td>
          <td>${formatUsageCount(day.sessions)}</td>
          <td>${formatUsageCount(day.commits)}</td>
        </tr>`
    )
    .join("");
  return `
    <div class="admin-workspace-body admin-usage-body">
      <div class="admin-metrics admin-metrics-time" aria-label="Development time summary" data-day-one="${escapeHtml(time.dayOne || "")}">
        ${metric("Day one", time.dayOne ? formatUsageInstant(time.dayOne) : "—", "is-nowrap")}
        ${metric("Calendar days", formatUsageCount(time.calendarDays))}
        ${metric("Active Cursor time", time.activeLabel || "0m")}
        ${metric("Sessions", formatUsageCount(time.sessions))}
        ${metric("Conversations", formatUsageCount(time.conversations))}
        ${metric("Git commits", formatUsageCount(time.commits))}
      </div>
      ${usageNoteHtml(report)}
      <div class="admin-table-wrap" role="region" aria-label="Development time by day" tabindex="0">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Active Cursor time</th>
              <th>Sessions</th>
              <th>Git commits</th>
            </tr>
          </thead>
          <tbody>${
            rows || `<tr><td colspan="4">No local Cursor transcripts or git days were found for this project.</td></tr>`
          }</tbody>
        </table>
      </div>
    </div>`;
}

export function renderTokenUsageHtml({ report } = {}) {
  if (!report) return usageLoadingHtml("Loading token usage…");
  if (!report.ok) {
    return usageLoadingHtml(report.message || "Could not load token usage.");
  }
  const tokens = report.tokens || {};
  const rows = (tokens.byFeature || [])
    .map((item) => {
      const pct = Math.round((Number(item.share) || 0) * 1000) / 10;
      return `
        <tr>
          <td>${escapeHtml(item.label || item.id)}</td>
          <td>${formatUsageCount(item.turns)}</td>
          <td>
            ${formatUsageCount(item.tokens)}
            <div class="admin-usage-share" aria-hidden="true"><span style="width:${pct}%"></span></div>
          </td>
          <td>${pct.toFixed(1)}%</td>
        </tr>`;
    })
    .join("");
  return `
    <div class="admin-workspace-body admin-usage-body">
      <div class="admin-metrics" aria-label="Token usage summary" data-total-tokens="${escapeHtml(String(tokens.total || 0))}">
        ${metric("Estimated tokens", formatUsageCount(tokens.total))}
        ${metric("Conversations", formatUsageCount(tokens.conversations))}
        ${metric("Prompt turns", formatUsageCount(tokens.turns))}
        ${metric("Features with usage", formatUsageCount((tokens.byFeature || []).length))}
      </div>
      ${usageNoteHtml(report)}
      <div class="admin-table-wrap" role="region" aria-label="Token usage by development feature" tabindex="0">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Development feature</th>
              <th>Turns</th>
              <th>Estimated tokens</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>${
            rows || `<tr><td colspan="4">No local Cursor transcripts were found for this project.</td></tr>`
          }</tbody>
        </table>
      </div>
    </div>`;
}

export function renderWorkspaceChrome({
  mode,
  mock,
  brand = "tesla",
  backupState = {},
  restoreState = {},
} = {}) {
  return `
    <div class="admin-workspace-toolbar">
      <div class="admin-workspace-toolbar-row">
        <div class="admin-workspace-nav">
          <div class="workspace-brand-toggle" role="group" aria-label="Brand">
            <button type="button" class="workspace-brand-btn${brand === "tesla" ? " is-active" : ""}" data-workspace-brand="tesla" aria-pressed="${brand === "tesla"}">Tesla</button>
            <button type="button" class="workspace-brand-btn${brand === "rivian" ? " is-active" : ""}" data-workspace-brand="rivian" aria-pressed="${brand === "rivian"}">Rivian</button>
          </div>
          <div class="layout-toggle workspace-mode-toggle" role="tablist" aria-label="Workspace mode">
            <button type="button" role="tab" class="layout-toggle-btn workspace-mode-btn${mode === "report" ? " is-active" : ""}" data-workspace-mode="report" aria-selected="${mode === "report"}">Development Report</button>
            <button type="button" role="tab" class="layout-toggle-btn workspace-mode-btn${mode === "images" ? " is-active" : ""}" data-workspace-mode="images" aria-selected="${mode === "images"}">Image Review</button>
            <button type="button" role="tab" class="layout-toggle-btn workspace-mode-btn${mode === "history" ? " is-active" : ""}" data-workspace-mode="history" aria-selected="${mode === "history"}">History</button>
            <button type="button" role="tab" class="layout-toggle-btn workspace-mode-btn${mode === "time" ? " is-active" : ""}" data-workspace-mode="time" aria-selected="${mode === "time"}">Dev Time</button>
            <button type="button" role="tab" class="layout-toggle-btn workspace-mode-btn${mode === "tokens" ? " is-active" : ""}" data-workspace-mode="tokens" aria-selected="${mode === "tokens"}">Token Usage</button>
          </div>
        </div>
        <div class="admin-workspace-window-actions">
          ${historyBackupButtonHtml(backupState, restoreState)}
          <button type="button" class="workspace-close-btn" data-close-workspace aria-label="Close window" title="Close window"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      ${mock ? `<p class="admin-mock-flag">Development mock — not production security</p>` : ""}
      ${historyBackupStatusHtml(backupState)}
    </div>`;
}
