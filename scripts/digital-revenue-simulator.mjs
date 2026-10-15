/** @typedef {'monthly' | 'annual'} BillingCadence */

/** @typedef {{ id: string, label: string, fleet: number | null }} YearInput */

/** @typedef {{ id: string, name: string, cadence: BillingCadence, prices: Record<string, number | null>, adoptions: Record<string, number | null> }} RevenueFeature */

/** @typedef {{ hardwareInvestmentPerVehicle: number | null, years: YearInput[], features: RevenueFeature[] }} SimulatorState */

/** @typedef {{ hardwareInvestmentPerVehicle: string, years: { id: string, label: string, fleet: string }[], features: { id: string, name: string, cadence: BillingCadence, prices: Record<string, string>, adoptions: Record<string, string> }[] }} SimulatorDraft */

export const DRS_STORAGE_KEY = "tesla-digital-revenue-simulator-v3";
export const DRS_MAX_YEARS = 12;

const DEFAULT_FEATURE_DEFS = [
  { id: "drs-fsd", name: "Full Self Driving", cadence: "monthly" },
  { id: "drs-premium-connectivity", name: "Premium Connectivity", cadence: "monthly" },
  { id: "drs-super-grok", name: "Super Grok", cadence: "monthly" },
  { id: "drs-super-grok-heavy", name: "Super Grok Heavy", cadence: "monthly" },
  { id: "drs-service", name: "Service", cadence: "annual" },
];

const BUILT_IN_FEATURE_IDS = new Set(DEFAULT_FEATURE_DEFS.map((def) => def.id));

/** @param {string} featureId */
export function isBuiltInFeature(featureId) {
  return BUILT_IN_FEATURE_IDS.has(featureId);
}

export function createYearId(index) {
  return `drs-year-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createFeatureId() {
  return `drs-feature-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_YEAR_IDS = new Set(["drs-year-default-1", "drs-year-default-2", "drs-year-default-3", "drs-year-default-4"]);

/** The original Year 1–4 columns stay. Only a year the user added can be deleted. */
export function isDefaultYear(yearId) {
  return DEFAULT_YEAR_IDS.has(yearId);
}

/** @param {number} count */
export function defaultYears(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: `drs-year-default-${i + 1}`,
    label: `Year ${i + 1}`,
    fleet: null,
  }));
}

/** @returns {SimulatorDraft} */
export function defaultSimulatorDraft() {
  const years = defaultYears(4);
  const yearIds = years.map((y) => y.id);
  return {
    hardwareInvestmentPerVehicle: "",
    years: years.map((y) => ({ id: y.id, label: y.label, fleet: "" })),
    features: DEFAULT_FEATURE_DEFS.map((def) => ({
      id: def.id,
      name: def.name,
      cadence: def.cadence,
      prices: Object.fromEntries(yearIds.map((id) => [id, ""])),
      adoptions: Object.fromEntries(yearIds.map((id) => [id, ""])),
    })),
  };
}

/**
 * @param {string} raw
 * @param {{ allowCompact?: boolean, isPercent?: boolean }} [opts]
 * @returns {number | null}
 */
export function parseSimulatorNumber(raw, opts = {}) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === "--") return null;
  s = s.replace(/[$,%\s]/g, "");
  if (!s) return null;

  if (opts.allowCompact) {
    const m = s.match(/^(-?\d*\.?\d+)([mMbBkK])?$/i);
    if (m) {
      let n = Number(m[1]);
      if (!Number.isFinite(n)) return null;
      const suffix = (m[2] || "").toLowerCase();
      if (suffix === "m") n *= 1_000_000;
      if (suffix === "b") n *= 1_000_000_000;
      if (suffix === "k") n *= 1_000;
      return n < 0 ? null : n;
    }
  }

  if (opts.isPercent) {
    const n = Number(s.replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 100) return null;
    return n;
  }

  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
}

/** Years the user has filled with a fleet size, price, or adoption rate. */
export function countEnteredYears(draft) {
  return draft.years.filter((year) => {
    if (parseSimulatorNumber(year.fleet, { allowCompact: true }) != null) return true;
    return draft.features.some((feature) => {
      if (parseSimulatorNumber(feature.prices?.[year.id]) != null) return true;
      return parseSimulatorNumber(feature.adoptions?.[year.id], { isPercent: true }) != null;
    });
  }).length;
}

function yearsPhrase(count) {
  return `${count} ${count === 1 ? "year" : "years"}`;
}

/** @param {SimulatorDraft} draft @returns {SimulatorState} */
export function draftToState(draft) {
  const years = (draft.years || []).slice(0, DRS_MAX_YEARS).map((y) => ({
    id: y.id,
    label: y.label || "Year",
    fleet: parseSimulatorNumber(y.fleet, { allowCompact: true }),
  }));
  const yearIds = new Set(years.map((y) => y.id));
  return {
    hardwareInvestmentPerVehicle: parseSimulatorNumber(draft.hardwareInvestmentPerVehicle),
    years,
    features: (draft.features || []).map((f) => {
      /** @type {Record<string, number | null>} */
      const prices = {};
      /** @type {Record<string, number | null>} */
      const adoptions = {};
      for (const y of years) {
        prices[y.id] = parseSimulatorNumber(f.prices?.[y.id]);
        adoptions[y.id] = parseSimulatorNumber(f.adoptions?.[y.id], { isPercent: true });
      }
      return {
        id: f.id,
        name: f.name || "New Revenue Feature",
        cadence: f.cadence === "annual" ? "annual" : "monthly",
        prices,
        adoptions,
      };
    }).filter((f) => yearIds.size === 0 || true),
  };
}

/** @param {BillingCadence} cadence */
export function periodsForCadence(cadence) {
  return cadence === "monthly" ? 12 : 1;
}

/** @param {RevenueFeature} feature @param {YearInput} year */
function yearHasPrice(feature, year) {
  const p = feature.prices[year.id];
  return p != null && Number.isFinite(p);
}

/** @param {SimulatorState} state */
export function computeSimulatorMetrics(state) {
  let totalRevenuePerSubscribedVehicle = 0;
  let totalFleetRevenue = 0;

  const features = state.features.map((feature) => {
    const periods = periodsForCadence(feature.cadence);
    let featureRevenuePerSubscribedVehicle = 0;
    let featureFleetRevenue = 0;

    for (const year of state.years) {
      if (!yearHasPrice(feature, year)) continue;
      const price = feature.prices[year.id];
      const annualUnits = price * periods;
      featureRevenuePerSubscribedVehicle += annualUnits;

      const fleet = year.fleet;
      const adoption = feature.adoptions[year.id];
      if (fleet != null && adoption != null) {
        featureFleetRevenue += annualUnits * fleet * (adoption / 100);
      }
    }

    totalRevenuePerSubscribedVehicle += featureRevenuePerSubscribedVehicle;
    totalFleetRevenue += featureFleetRevenue;

    return {
      id: feature.id,
      name: feature.name,
      cadence: feature.cadence,
      featureRevenuePerSubscribedVehicle,
      featureFleetRevenue,
      share: 0,
    };
  });

  for (const row of features) {
    row.share = totalFleetRevenue > 0 ? row.featureFleetRevenue / totalFleetRevenue : 0;
  }

  return {
    totalRevenuePerSubscribedVehicle,
    totalFleetRevenue,
    features,
    yearCount: state.years.length,
  };
}

export function formatPerVehicleAmount(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "$--";
  const rounded = Math.round(value * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return `$${rounded.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export function formatHardwareAmount(value) {
  if (value == null || !Number.isFinite(value)) return "$--";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatFleetCompact(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "$--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    const digits = b >= 10 ? 2 : b >= 1 ? 2 : 3;
    return `$${trimTrailingZeros(b.toFixed(digits))}B`;
  }
  if (abs >= 1_000_000) {
    const m = value / 1_000_000;
    const digits = m >= 100 ? 0 : m >= 10 ? 2 : 2;
    return `$${trimTrailingZeros(m.toFixed(digits))}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
  return formatPerVehicleAmount(value);
}

function trimTrailingZeros(s) {
  return s.replace(/\.?0+$/, "");
}

export function formatPercentShare(share) {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  return `${Math.round(share * 100)}%`;
}

export function formatBreakdownAmount(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "$--M";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return formatFleetCompact(value);
  if (abs >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${trimTrailingZeros(m.toFixed(m >= 100 ? 0 : 2))}M`;
  }
  return formatFleetCompact(value);
}

export function loadSimulatorDraft() {
  try {
    const raw = localStorage.getItem(DRS_STORAGE_KEY);
    if (!raw) return defaultSimulatorDraft();
    const parsed = JSON.parse(raw);
    return normalizeDraft(parsed);
  } catch {
    return defaultSimulatorDraft();
  }
}

/** @param {unknown} draft */
export function normalizeDraft(draft) {
  const base = defaultSimulatorDraft();
  if (!draft || typeof draft !== "object") return base;
  const d = /** @type {SimulatorDraft} */ (draft);
  const years = Array.isArray(d.years) && d.years.length ? d.years.slice(0, DRS_MAX_YEARS) : base.years;
  const yearIds = years.map((y, i) => ({
    id: y.id || `drs-year-${i + 1}`,
    label: y.label || `Year ${i + 1}`,
    fleet: y.fleet != null ? String(y.fleet) : "",
  }));
  const ids = yearIds.map((y) => y.id);
  const features =
    Array.isArray(d.features) && d.features.length
      ? d.features.map((f, i) => ({
          id: f.id || createFeatureId(),
          name: f.name || "New Revenue Feature",
          cadence: f.cadence === "annual" ? "annual" : "monthly",
          prices: Object.fromEntries(ids.map((id) => [id, f.prices?.[id] != null ? String(f.prices[id]) : ""])),
          adoptions: Object.fromEntries(
            ids.map((id) => [id, f.adoptions?.[id] != null ? String(f.adoptions[id]) : ""])
          ),
        }))
      : base.features;

  return {
    hardwareInvestmentPerVehicle:
      d.hardwareInvestmentPerVehicle != null ? String(d.hardwareInvestmentPerVehicle) : "",
    years: yearIds,
    features,
  };
}

/** @param {SimulatorDraft} draft */
export function saveSimulatorDraft(draft) {
  try {
    localStorage.setItem(DRS_STORAGE_KEY, JSON.stringify(normalizeDraft(draft)));
  } catch {
    /* ignore */
  }
}

/** @param {SimulatorDraft} draft @param {number} nextIndex */
export function appendYear(draft, nextIndex) {
  if (draft.years.length >= DRS_MAX_YEARS) return draft;
  const id = createYearId(nextIndex);
  draft.years.push({ id, label: `Year ${nextIndex}`, fleet: "" });
  for (const f of draft.features) {
    f.prices[id] = "";
    f.adoptions[id] = "";
  }
  return draft;
}

/** @param {SimulatorDraft} draft @param {string} yearId */
export function removeYear(draft, yearId) {
  if (draft.years.length <= 1 || isDefaultYear(yearId)) return draft;
  const index = draft.years.findIndex((y) => y.id === yearId);
  if (index < 0) return draft;
  draft.years.splice(index, 1);
  for (const feature of draft.features) {
    delete feature.prices[yearId];
    delete feature.adoptions[yearId];
  }
  draft.years.forEach((year, i) => {
    year.label = `Year ${i + 1}`;
  });
  return draft;
}

/** @param {SimulatorDraft} draft */
export function appendFeature(draft) {
  const id = createFeatureId();
  draft.features.push({
    id,
    name: "New Revenue Feature",
    cadence: "monthly",
    prices: Object.fromEntries(draft.years.map((y) => [y.id, ""])),
    adoptions: Object.fromEntries(draft.years.map((y) => [y.id, ""])),
  });
  return draft;
}

/** @param {SimulatorDraft} draft @param {string} featureId */
export function removeFeature(draft, featureId) {
  if (isBuiltInFeature(featureId)) return draft;
  const index = draft.features.findIndex((feature) => feature.id === featureId);
  if (index < 0) return draft;
  draft.features.splice(index, 1);
  return draft;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cadenceUnit(cadence) {
  return cadence === "annual" ? "/ Year" : "/ month";
}

function yearGridCells(draft, renderCell) {
  return draft.years.map((y) => renderCell(y)).join("");
}

/** @param {SimulatorDraft} draft @param {ReturnType<typeof computeSimulatorMetrics>} metrics @param {SimulatorState} state */
function iconEdit() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 3.6a1.8 1.8 0 0 1 2.5 2.5L8.2 17.1 4.2 18.1l1-4 11.4-10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.4 5.8 18.2 9.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
}

function iconClose() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 7.2 16.8 16.8M16.8 7.2 7.2 16.8" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round"/></svg>`;
}

function connectivityCheck() {
  return `<span class="drs-info-check" aria-label="Included"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.3 6.3 11.4 12.8 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

function renderFsdInfoModal() {
  return `<div class="drs-info-modal drs-fsd-modal" hidden>
    <button type="button" class="drs-info-backdrop drs-fsd-backdrop" data-drs-action="close-feature-info" aria-label="Close Full Self-Driving details"></button>
    <div class="drs-fsd-dialog" role="dialog" aria-modal="true" aria-labelledby="drs-fsd-title">
      <button type="button" class="drs-info-iconbtn drs-fsd-edit" data-drs-action="edit-page-content" aria-label="Edit this page" aria-pressed="false">${iconEdit()}</button>
      <button type="button" class="drs-fsd-close" data-drs-action="close-feature-info" aria-label="Close">${iconClose()}</button>
      <h2 class="drs-fsd-title" id="drs-fsd-title"><a href="https://www.tesla.com/support/fsd#suspension-last" target="_blank" rel="noopener noreferrer">Full Self-Driving (Supervised) Subscriptions</a></h2>
      <p class="drs-fsd-lead">FSD (Supervised) is available as a monthly subscription of $99. You can subscribe to FSD (Supervised) from the Tesla app or your vehicle’s touchscreen.</p>
      <section class="drs-fsd-block">
        <h3>FSD (Supervised) Features</h3>
        <p>Your vehicle will be able to drive itself almost anywhere under your active supervision and will continuously improve with future software updates. In addition to active safety features and Traffic-Aware Cruise Control (TACC), with the Full Self-Driving (Supervised) package, your Tesla vehicle:</p>
        <h4>Drives to You</h4>
        <p>Using the Tesla app, Actually Smart Summon<sup>1</sup> navigates your vehicle in more complex environments and parking spaces, maneuvering around objects as necessary to come find you in a parking lot. In addition, Dumb Summon<sup>1</sup> moves your vehicle in and out of a tight space.</p>
        <h4>Drives for You</h4>
        <p>Full Self-Driving (Supervised) works in a variety of driving scenarios and any type of roadway, including residential and city streets. On-board cameras with 360-degree visibility check your blind spots and move your Tesla vehicle into a neighboring lane while maintaining your speed and avoiding bikes, motorcycles and other cars.</p>
        <h4>Parks for You</h4>
        <p>Autopark helps automatically parallel or perpendicular park your vehicle.</p>
      </section>
      <section class="drs-fsd-block">
        <h3>Can I cancel my subscription?</h3>
        <p>You can cancel your FSD (Supervised) subscription at any time from the Tesla app. Monthly subscription payments will not be prorated. After your cancelation is processed, you will continue to have FSD (Supervised) features for the remainder of the current billing period.</p>
      </section>
      <section class="drs-fsd-block">
        <p class="drs-fsd-strong">Future outlook:<br>Prices will increase as capabilities improve.<br>Larger price jumps expected when reaching unsupervised driving.</p>
        <p class="drs-fsd-link">Tesla CEO Elon Musk Says FSD Subscription Prices Will Rise “as Capabilities Improve”</p>
      </section>
    </div>
  </div>`;
}

function renderGrokInfoModal() {
  return `<div class="drs-info-modal drs-grok-modal" hidden>
    <button type="button" class="drs-info-backdrop drs-fsd-backdrop" data-drs-action="close-feature-info" aria-label="Close Grok details"></button>
    <div class="drs-fsd-dialog" role="dialog" aria-modal="true" aria-labelledby="drs-grok-title">
      <button type="button" class="drs-info-iconbtn drs-fsd-edit" data-drs-action="edit-page-content" aria-label="Edit this page" aria-pressed="false">${iconEdit()}</button>
      <button type="button" class="drs-fsd-close" data-drs-action="close-feature-info" aria-label="Close">${iconClose()}</button>
      <h2 class="drs-fsd-title" id="drs-grok-title">Grok &amp; SuperGrok</h2>
      <p class="drs-fsd-lead">Grok is your AI companion, an advanced artificial intelligence built by SpaceXAI and is available in Tesla vehicles.</p>
      <section class="drs-fsd-block">
        <h3>Grok's Capabilities</h3>
        <p>Grok in a Tesla can control over 114 to 116 direct hardware and infotainment functions completely hands-free.</p>
        <p><strong>Climate:</strong> Set cabin temperatures, adjust fan speed, change airflow direction, turn on/off A/C and recirculation, activate Dog Mode, Camp Mode, seat heaters, and steering wheel heaters.</p>
        <p><strong>Controls &amp; Hardware:</strong> Fold mirrors, cycle windshield wiper speeds/crank wipers, pop the glovebox, turn on headlights, and manage Sentry Mode or save dashcam clips.</p>
        <p><strong>Navigation &amp; Trips:</strong> Find Superchargers, look up food/businesses, and plan complex, multi-stop conversational routes (though it does not execute physical FSD driving maneuvers like lane changes).</p>
        <p><strong>Entertainment &amp; Media:</strong> Search streaming services, queue music, and control media playback across apps like Spotify, Netflix, and YouTube.</p>
        <p><strong>Information &amp; Calls:</strong> Place phone calls from a paired phone, check tire pressures, and read odometer readings.</p>
      </section>
      <section class="drs-fsd-block">
        <h3>Grok Base Tier (Included)</h3>
        <p><strong>Cost:</strong> $0 (Requires Tesla's $9.99/month or $99/year Premium Connectivity plan for cellular data, or free over Wi-Fi).</p>
        <p><strong>Limits:</strong> The free built-in tier is capped at a lower rate limit, roughly 7 to 10 interactions every 2 hours. Once reached, your car will prompt you that you have hit the limit until it resets.</p>
      </section>
      <section class="drs-fsd-block">
        <h3>SuperGrok High-Usage Paid Upgrades (Optional)</h3>
        <p>If you want to bypass the base tier limits or use advanced agent features in your car, you can sign in using a paid xAI / Grok subscription:</p>
        <p><strong>Cost: SuperGrok:</strong> $30 per month or $300 per year (unlocks higher limits and full web features).</p>
      </section>
      <section class="drs-fsd-block">
        <p class="drs-fsd-strong">Future outlook:</p>
        <p class="drs-fsd-link">Musk: Tesla FSD to Get Grok Voice Controls This Fall</p>
        <p class="drs-fsd-link">Tesla VP Confirms Grok FSD Integration is Coming Soon</p>
    </div>
  </div>`;
}

function renderGrokHeavyInfoModal() {
  return `<div class="drs-info-modal drs-grok-heavy-modal" hidden>
    <button type="button" class="drs-info-backdrop drs-fsd-backdrop" data-drs-action="close-feature-info" aria-label="Close Super Grok Heavy details"></button>
    <div class="drs-fsd-dialog" role="dialog" aria-modal="true" aria-labelledby="drs-grok-heavy-title">
      <button type="button" class="drs-info-iconbtn drs-fsd-edit" data-drs-action="edit-page-content" aria-label="Edit this page" aria-pressed="false">${iconEdit()}</button>
      <button type="button" class="drs-fsd-close" data-drs-action="close-feature-info" aria-label="Close">${iconClose()}</button>
      <h2 class="drs-fsd-title" id="drs-grok-heavy-title">SuperGrok Heavy</h2>
      <p class="drs-fsd-lead">SuperGrok Heavy is a high-tier xAI subscription (priced around <strong>$300 a month</strong>) that unlocks advanced, task-executing "Grok Bot" and "Connectors" features inside Tesla vehicles</p>
      <section class="drs-fsd-block">
        <h3>SuperGrok's Capabilities</h3>
        <p><strong>In-Car Assistant:</strong> It turns your Tesla cabin into a hands-free mobile office by letting you manage emails, calendars, finances, and files using only your voice.</p>
        <p><strong>Task Execution:</strong> Unlike basic conversational AI, Grok Bot can perform multi-step real-world errands, such as placing coffee or food pickup orders, shopping online (like Amazon), and booking reservations while FSD (Supervised) handles the driving.</p>
      </section>
    </div>
  </div>`;
}

function renderServiceInfoModal() {
  return `<div class="drs-info-modal drs-service-modal" hidden>
    <button type="button" class="drs-info-backdrop drs-fsd-backdrop" data-drs-action="close-feature-info" aria-label="Close Service details"></button>
    <div class="drs-fsd-dialog" role="dialog" aria-modal="true" aria-labelledby="drs-service-title">
      <button type="button" class="drs-info-iconbtn drs-fsd-edit" data-drs-action="edit-page-content" aria-label="Edit this page" aria-pressed="false">${iconEdit()}</button>
      <button type="button" class="drs-fsd-close" data-drs-action="close-feature-info" aria-label="Close">${iconClose()}</button>
      <h2 class="drs-fsd-title" id="drs-service-title">Service</h2>
      <p class="drs-fsd-lead">Service covers hardware maintenance and repairs for revenue-generating features.</p>
      <section class="drs-fsd-block">
        <div class="drs-service-row">
          <div>
            <p class="drs-service-name">Interior front-windshield and camera precision cleaning</p>
            <p class="drs-service-note">depending on the service center location and whether it is booked via the app</p>
          </div>
          <p class="drs-service-price">$60–$89</p>
        </div>
      </section>
    </div>
  </div>`;
}

function renderConnectivityInfoModal() {
  const check = connectivityCheck();
  const row = (name, standard, premium) => `<div class="drs-info-name">${name}</div><div class="drs-info-mark">${standard ? check : ""}</div><div class="drs-info-mark">${premium ? check : ""}</div>`;
  return `<div class="drs-info-modal" hidden>
    <button type="button" class="drs-info-backdrop" data-drs-action="close-feature-info" aria-label="Close connectivity features"></button>
    <div class="drs-info-dialog" role="dialog" aria-modal="true" aria-labelledby="drs-info-title">
      <div class="drs-info-toolbar">
        <button type="button" class="drs-info-iconbtn" data-drs-action="edit-page-content" aria-label="Edit this page" aria-pressed="false">${iconEdit()}</button>
        <button type="button" class="drs-info-iconbtn" data-drs-action="close-feature-info" aria-label="Close">${iconClose()}</button>
      </div>
      <div class="drs-info-grid">
        <h2 class="drs-info-title" id="drs-info-title">Connectivity Features</h2>
        <div class="drs-info-colhead">Standard</div>
        <div class="drs-info-colhead">Premium<span class="drs-info-price">$9.99/month</span></div>
        <h3 class="drs-info-section">Navigation</h3>
        ${row("Navigation With Real-Time Traffic Along the Route", true, true)}
        <h3 class="drs-info-section">AI Companion <span class="drs-info-mini" aria-hidden="true">i</span></h3>
        ${row("Grok", false, true)}
        <h3 class="drs-info-section">Maps and Weather</h3>
        ${row("Satellite-View Maps", false, true)}
        ${row("Weather Forecast and Precipitation Maps", false, true)}
        ${row("Speed Cameras", false, true)}
        ${row("Live Traffic Maps", false, true)}
        <h3 class="drs-info-section">Safety and Surveillance</h3>
        ${row("Sentry Mode – View Live Camera", false, true)}
        ${row("Mobile App Dashcam Viewer", false, true)}
        ${row("Pet Mode – View Live Cabin Camera", false, true)}
        <h3 class="drs-info-section">Media and Entertainment</h3>
        ${row('Music Streaming<sup>1,2</sup>', false, true)}
        ${row('Video Streaming<sup>1,2</sup>', false, true)}
        ${row("Karaoke", false, true)}
        ${row("Internet Browser<sup>1</sup>", false, true)}
      </div>
    </div>
  </div>`;
}

export function renderDigitalRevenueSimulatorHtml(draft, metrics, state) {
  const yearCount = draft.years.length;
  const yearHeaders = yearGridCells(
    draft,
    (y) => {
      if (isDefaultYear(y.id)) {
        return `<div class="drs-year-head-wrap">
        <span class="drs-year-head">${escapeHtml(y.label)}</span>
      </div>`;
      }
      return `<div class="drs-year-head-wrap">
        <button type="button" class="drs-year-head" data-drs-action="prompt-delete-year" data-drs-year-id="${escapeHtml(y.id)}" aria-expanded="false">${escapeHtml(y.label)}</button>
        <button type="button" class="drs-delete-year" data-drs-action="delete-year" data-drs-year-id="${escapeHtml(y.id)}">Delete year</button>
      </div>`;
    }
  );

  const fleetCells = yearGridCells(
    draft,
    (y) => `<div class="drs-field-cell">
        <div class="drs-field-top drs-field-top--fleet">
          <input type="text" class="drs-fleet-input" data-drs-field="fleet" data-drs-year-id="${escapeHtml(y.id)}" value="${escapeHtml(y.fleet)}" placeholder="Enter volume" aria-label="${escapeHtml(y.label)} fleet volume" />
        </div>
        <div class="drs-field-unit">Vehicle</div>
      </div>`
  );

  const featureRows = draft.features
    .map((f) => {
      const m = metrics.features.find((row) => row.id === f.id);
      const unit = cadenceUnit(f.cadence);

      const priceCells = yearGridCells(
        draft,
        (y) => `<div class="drs-field-cell">
            <div class="drs-field-top">
              <span class="drs-field-glyph" aria-hidden="true">$</span>
              <input type="text" class="drs-price-input" data-drs-field="price" data-drs-feature-id="${escapeHtml(f.id)}" data-drs-year-id="${escapeHtml(y.id)}" value="${escapeHtml(f.prices[y.id] || "")}" placeholder="Enter" aria-label="${escapeHtml(f.name)} price ${escapeHtml(y.label)}" />
            </div>
            <div class="drs-field-unit">${escapeHtml(unit)}</div>
          </div>`
      );

      const adoptionCells = yearGridCells(
        draft,
        (y) => `<div class="drs-field-cell">
            <div class="drs-field-top">
              <span class="drs-field-glyph" aria-hidden="true">- -</span>
              <input type="text" class="drs-adoption-input" data-drs-field="adoption" data-drs-feature-id="${escapeHtml(f.id)}" data-drs-year-id="${escapeHtml(y.id)}" value="${escapeHtml(f.adoptions[y.id] || "")}" placeholder="Enter" aria-label="${escapeHtml(f.name)} adoption ${escapeHtml(y.label)}" />
            </div>
            <div class="drs-field-unit">%</div>
          </div>`
      );

      const hasInfo = f.id === "drs-premium-connectivity";
      const hasFsd = f.id === "drs-fsd";
      const hasGrok = f.id === "drs-super-grok";
      const hasGrokHeavy = f.id === "drs-super-grok-heavy";
      const hasService = f.id === "drs-service";
      const builtIn = isBuiltInFeature(f.id);
      const detail = hasFsd ? "fsd" : hasInfo ? "connectivity" : hasGrok ? "grok" : hasGrokHeavy ? "grok-heavy" : hasService ? "service" : "";
      const priceNote = hasFsd
        ? "$99/month (2026)"
        : hasInfo
          ? "$9.99/month (2026)"
          : hasGrok
            ? "$30/month (2026)"
            : hasGrokHeavy
              ? "$300/month (2026)"
              : "";
      return `<article class="drs-feature" data-drs-feature-id="${escapeHtml(f.id)}">
        <div class="drs-feature-name-card${hasInfo ? " has-info" : ""}${detail ? " has-detail" : ""}${builtIn ? " is-built-in" : ""}"${detail ? ` data-drs-detail="${detail}"` : ""}${builtIn ? "" : ` data-drs-action="prompt-delete-feature" data-drs-feature-id="${escapeHtml(f.id)}"`}>
          <div class="drs-feature-name-main">
            <input type="text" class="drs-feature-name-input" data-drs-field="feature-name" data-drs-feature-id="${escapeHtml(f.id)}" value="${escapeHtml(f.name)}" aria-label="Feature name"${detail ? " readonly" : ""} />
            ${priceNote ? `<p class="drs-feature-price-note">${priceNote}</p>` : ""}
          </div>
          ${builtIn ? "" : `<button type="button" class="drs-delete-feature" data-drs-action="delete-feature" data-drs-feature-id="${escapeHtml(f.id)}" aria-label="Delete ${escapeHtml(f.name)}">×</button>`}
        </div>
        <div class="drs-feature-body">
          <div class="drs-feature-row">
            <div class="drs-row-label">PRICE</div>
            <div class="drs-year-strip-main">
              <div class="drs-year-grid">${priceCells}</div>
            </div>
          </div>
          <div class="drs-feature-row">
            <div class="drs-row-label">ADOPTION</div>
            <div class="drs-year-strip-main">
              <div class="drs-year-grid">${adoptionCells}</div>
            </div>
          </div>
        </div>
        <div class="drs-feature-results" aria-label="Calculated results for ${escapeHtml(f.name)}">
          <div class="drs-mini-stack">
            <div class="drs-mini-result" data-drs-out="feature-pv-${escapeHtml(f.id)}">${escapeHtml(formatPerVehicleAmount(m?.featureRevenuePerSubscribedVehicle ?? 0))}</div>
            <div class="drs-mini-result-label">Feature Revenue / SUBSCRIBED VEHICLE</div>
          </div>
          <div class="drs-mini-stack">
            <div class="drs-mini-result" data-drs-out="feature-fleet-${escapeHtml(f.id)}">${escapeHtml(formatFleetCompact(m?.featureFleetRevenue ?? 0))}</div>
            <div class="drs-mini-result-label">Feature Fleet Revenue / SUBSCRIBED VEHICLES</div>
          </div>
        </div>
      </article>`;
    })
    .join("");

  const breakdown = draft.features
    .map((f) => {
      const m = metrics.features.find((row) => row.id === f.id);
      const share = m?.share ?? 0;
      const pct = formatPercentShare(share);
      const width = Math.max(0, Math.min(100, share * 100));
      return `<div class="drs-breakdown-row">
        <span class="drs-breakdown-name" data-drs-out="breakdown-name-${escapeHtml(f.id)}">${escapeHtml(f.name)}</span>
        <span class="drs-breakdown-amount" data-drs-out="breakdown-amt-${escapeHtml(f.id)}">${escapeHtml(formatBreakdownAmount(m?.featureFleetRevenue ?? 0))}</span>
        <span class="drs-breakdown-pct" data-drs-out="breakdown-pct-${escapeHtml(f.id)}">${pct}</span>
        <div class="drs-bar-track" aria-hidden="true">
          <div class="drs-bar-fill" data-drs-out="breakdown-bar-${escapeHtml(f.id)}" style="width:${width}%"></div>
        </div>
      </div>`;
    })
    .join("");

  const hw = formatHardwareAmount(state.hardwareInvestmentPerVehicle);
  const perV = formatPerVehicleAmount(metrics.totalRevenuePerSubscribedVehicle);
  const fleet = formatFleetCompact(metrics.totalFleetRevenue);
  const takeawayY =
    metrics.totalRevenuePerSubscribedVehicle > 0
      ? formatPerVehicleAmount(metrics.totalRevenuePerSubscribedVehicle)
      : "$--";

  return `<div class="drs-view" style="--drs-years:${yearCount}">
    <p class="drs-lead">A simple simulator that connects upfront hardware investment with long-term Software as a Service revenue potential.</p>
    <p class="drs-lead-steps">1. Enter price to see feature revenue&ensp;&ensp;2. Add fleet size and adoption rate to see fleet revenue.</p>
    <div class="drs-shell">
      <div class="drs-work-scroll">
        <div class="drs-header-combined">
          <div class="drs-hw-cell">
            <div class="drs-hw-band drs-hw-band--year">
              <div class="drs-hardware-label"><span>HARDWARE</span><span>COST</span></div>
            </div>
            <div class="drs-hw-band drs-hw-band--fleet">
              <div class="drs-field-cell drs-field-cell--hardware">
                <div class="drs-field-top drs-field-top--hardware">
                  <span class="drs-field-glyph" aria-hidden="true">$</span>
                  <input type="text" class="drs-hw-input" data-drs-field="hardware" value="${escapeHtml(draft.hardwareInvestmentPerVehicle)}" placeholder="Enter Cost" aria-label="Hardware investment per vehicle" />
                </div>
                <div class="drs-field-unit">Per Vehicle</div>
              </div>
            </div>
          </div>
          <div class="drs-year-band">
            <div class="drs-year-pill" aria-hidden="true"></div>
            <div class="drs-feature-body drs-strip-body">
              <div class="drs-feature-row">
                <div class="drs-row-label drs-row-label--spacer" aria-hidden="true"></div>
                <div class="drs-year-strip-main">
                  <div class="drs-year-grid drs-year-grid-headers">${yearHeaders}</div>
                </div>
              </div>
            </div>
            <button type="button" class="drs-add-year" data-drs-action="add-year"${yearCount >= DRS_MAX_YEARS ? " disabled" : ""}>
              <span class="drs-plus-circle" aria-hidden="true">+</span>
              <span class="drs-add-year-label">Add Year</span>
            </button>
          </div>
          <div class="drs-header-main">
            <div class="drs-fleet-strip">
              <div class="drs-feature-body drs-strip-body">
                <div class="drs-feature-row">
                  <div class="drs-row-label drs-row-label--fleet"><span>FLEET</span></div>
                  <div class="drs-year-strip-main">
                    <div class="drs-year-grid drs-year-grid-fleet">${fleetCells}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="drs-calc-results-head" aria-hidden="true"></div>
        </div>
        <div class="drs-features">${featureRows}</div>
        <div class="drs-year-scrollbar-row">
          <div class="drs-year-scrollbar-body">
            <div class="drs-row-label drs-row-label--spacer" aria-hidden="true"></div>
            <div class="drs-year-strip-main drs-year-scrollbar-track">
              <div class="drs-year-scrollbar-inner"></div>
            </div>
          </div>
        </div>
        <div class="drs-feature-actions">
          <button type="button" class="drs-add-feature-bar" data-drs-action="add-feature">
            <span class="drs-plus-circle" aria-hidden="true">+</span>
            <span>Add Revenue Feature</span>
          </button>
          <button type="button" class="drs-reset-scenario" data-drs-action="reset-scenario">Reset Scenario</button>
        </div>
      </div>
      <aside class="drs-sidebar" aria-label="Digital revenue results">
        <div class="drs-sidebar-title">TOTAL DIGITAL REVENUE</div>
        <div class="drs-sidebar-subtitle">ACROSS ALL FEATURES</div>
        <div class="drs-result-card drs-result-fleet">
          <div class="drs-result-value" data-drs-out="total-fleet">${escapeHtml(fleet)}</div>
          <div class="drs-result-label">Total Fleet Revenue from Subscribed Vehicles</div>
        </div>
        <div class="drs-result-card drs-result-vehicle">
          <div class="drs-result-value" data-drs-out="total-pv">${escapeHtml(perV)}</div>
          <div class="drs-result-label">Revenue per Subscribed Vehicle</div>
        </div>
        <hr class="drs-divider" />
        <div class="drs-breakdown">
          <h3 class="drs-breakdown-title">REVENUE BY FEATURE</h3>
          ${breakdown}
        </div>
        <hr class="drs-divider" />
        <div class="drs-takeaway">
          <h3 class="drs-takeaway-title">KEY TAKEAWAY</h3>
          <p data-drs-out="takeaway">With a <span class="drs-em">${escapeHtml(hw)}</span> hardware investment per vehicle, the simulator shows <span class="drs-em">${escapeHtml(takeawayY)}</span> in potential software as a Service (SaaS) revenue per vehicle over ${yearsPhrase(countEnteredYears(draft))}.</p>
        </div>
      </aside>
    </div>
    ${renderConnectivityInfoModal()}
    ${renderFsdInfoModal()}
    ${renderGrokInfoModal()}
    ${renderGrokHeavyInfoModal()}
    ${renderServiceInfoModal()}
  </div>`;
}

/** @param {HTMLElement} root @param {ReturnType<typeof computeSimulatorMetrics>} metrics @param {SimulatorState} state @param {SimulatorDraft} draft */
export function patchDigitalRevenueOutputs(root, metrics, state, draft) {
  const set = (sel, text) => {
    root.querySelectorAll(sel).forEach((el) => {
      el.textContent = text;
    });
  };
  set('[data-drs-out="total-fleet"]', formatFleetCompact(metrics.totalFleetRevenue));
  set('[data-drs-out="total-pv"]', formatPerVehicleAmount(metrics.totalRevenuePerSubscribedVehicle));
  for (const f of draft.features) {
    const row = metrics.features.find((r) => r.id === f.id);
    set(`[data-drs-out="feature-pv-${f.id}"]`, formatPerVehicleAmount(row?.featureRevenuePerSubscribedVehicle ?? 0));
    set(`[data-drs-out="feature-fleet-${f.id}"]`, formatFleetCompact(row?.featureFleetRevenue ?? 0));
    set(`[data-drs-out="breakdown-name-${f.id}"]`, f.name || "New Revenue Feature");
    const share = row?.share ?? 0;
    set(`[data-drs-out="breakdown-amt-${f.id}"]`, formatBreakdownAmount(row?.featureFleetRevenue ?? 0));
    set(`[data-drs-out="breakdown-pct-${f.id}"]`, formatPercentShare(share));
    const bar = root.querySelector(`[data-drs-out="breakdown-bar-${f.id}"]`);
    if (bar instanceof HTMLElement) bar.style.width = `${Math.max(0, Math.min(100, share * 100))}%`;
  }
  const hw = formatHardwareAmount(state.hardwareInvestmentPerVehicle);
  const takeawayY =
    metrics.totalRevenuePerSubscribedVehicle > 0
      ? formatPerVehicleAmount(metrics.totalRevenuePerSubscribedVehicle)
      : "$--";
  const takeaway = root.querySelector('[data-drs-out="takeaway"]');
  if (takeaway) {
    takeaway.innerHTML = `With a <span class="drs-em">${escapeHtml(hw)}</span> hardware investment per vehicle, the simulator shows <span class="drs-em">${escapeHtml(takeawayY)}</span> in potential software as a Service (SaaS) revenue per vehicle over ${yearsPhrase(countEnteredYears(draft))}.`;
  }
}
