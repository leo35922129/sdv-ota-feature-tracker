/**
 * Combine 2012–2016 Electrek historical cards with matching Model S/X import
 * cards so the UI shows one feature card (shared title+description → one group).
 *
 * Both records stay in releases.json. Electrek imagery and the S/X source URL
 * are preserved. Unlisted lookalikes are left separate.
 */
export const ELECTREK_SOURCE = "electrek";
export const SX_SOURCE = "tesla-model-s-x-2012-2019";

export function normalizeDedupeKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\bbeta\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Explicit [S/X title key, Electrek title key] pairs. No fuzzy matching. */
export const ELECTREK_SX_PAIRS = [
  ["app launcher", "app launcher"],
  ["auto presenting door handles", "auto present door handles"],
  ["homelink location awareness", "location aware homelink"],
  [
    "steering wheel controls for fan speed and sunroof",
    "fan speed and sunroof controls to steering wheel controls",
  ],
  ["usb media browsing", "usb sorting for media"],
  ["vehicle sleep", "vehicle sleep mode reduced vampire drain"],
  ["voice commands", "voice commands"],
  ["driver profiles", "driver profiles up to 10 can be saved"],
  [
    "charging anomaly protection",
    "current anomaly detection auto reduce charging amp by 25 if problem is detected",
  ],
  [
    "radio presets on steering wheel controls",
    "radio presets to steering wheel controls",
  ],
  ["screen cleaning mode", "screen cleaning mode"],
  ["tow mode", "tow mode"],
  ["wiper service mode", "wiper service mode"],
  ["contact sorting", "contact sorting options"],
  [
    "wall power battery support and improved battery heating",
    "battery support will draw power from wall instead of battery for hvac",
  ],
  [
    "wall power battery support and improved battery heating",
    "battery ability to heat from utility instead of itself",
  ],
  ["scheduled charging", "scheduled charging mode"],
  ["supercharger locations on maps", "supercharger locations to maps"],
  ["hill start assist", "hill assist"],
  ["home work and favorite navigation locations", "home and work locations"],
  ["calendar app", "calendar"],
  ["location based smart air suspension", "location based air suspension settings"],
  ["power management options", "more power management options"],
  ["launch mode", "launch mode"],
  ["trip energy prediction and energy use chart", "trip energy prediction"],
  ["automatic emergency braking", "aeb auto emergency braking"],
  ["blind spot warning", "blind spot warning"],
  ["range assurance", "range assurance"],
  ["supercharger trip planner", "trip planner with routing via superchargers"],
  ["valet mode", "valet mode"],
  ["display auto brightness", "auto brightness to display"],
  ["homelink auto open close", "homelink auto open close"],
  ["summon", "summon to ap1 cars"],
  ["supercharger amenities", "supercharger amenities"],
  [
    "cabin overheat protection",
    "cabin overheat protection cools the cabin if past 40c",
  ],
  ["creep setting", "creep mode emulate automatic transmission idle forward"],
  ["calling from maps", "ability to call phone numbers from map screen"],
  ["two level front defrost", "new defrost mode"],
  [
    "charge limit slider",
    "battery charge limit slider standard and max range",
  ],
  ["wi fi connectivity", "wifi"],
  [
    "heading up map orientation",
    "tracking modes in map north up or vehicle up",
  ],
  ["tpms sensor reset after wheel changes", "tpms reset option"],
  ["traffic based navigation", "traffic aware navigation"],
  ["vehicle name", "custom car name"],
  ["traffic aware cruise control", "tacc to ap1 cars"],
  [
    "forward collision warning and auto high beam",
    "forward collision warning to ap1 cars",
  ],
  [
    "forward collision warning and auto high beam",
    "auto high beam to ap1 cars",
  ],
  ["perpendicular autopark", "perpendicular autopark"],
  [
    "expanded smart air suspension controls",
    "smart air suspension options auto lower for highway speeds",
  ],
  [
    "supercharger and visited charger map display",
    "visited chargers to maps",
  ],
  ["rated range estimate", "projected and rated range"],
  ["personalized internet music", "rdio"],
];

const PAIR_LOOKUP = new Map(
  ELECTREK_SX_PAIRS.map(([sx, ek]) => [`${sx}::${ek}`, true])
);

export function featureGroupKey(feature) {
  if (feature?.dedupedInto) return `dedupe:${feature.dedupedInto}`;
  if (feature?.electrekDeduped && feature.id) return `dedupe:${feature.id}`;
  return `${feature?.title || ""}\n${feature?.description ?? ""}`;
}

export function featureDedupeKey(feature) {
  return normalizeDedupeKey(feature?.titleBeforeDedupe || feature?.title);
}

export function shouldPairElectrekWithSx(sxFeature, electrekFeature) {
  const sxKey = featureDedupeKey(sxFeature);
  const ekKey = featureDedupeKey(electrekFeature);
  return PAIR_LOOKUP.has(`${sxKey}::${ekKey}`);
}

export function pairElectrekSxFeatures(features) {
  const sx = (features || []).filter((f) => f.source === SX_SOURCE);
  const electrek = (features || []).filter((f) => f.source === ELECTREK_SOURCE);
  const usedEk = new Set();
  const pairs = [];
  for (const s of sx) {
    for (const e of electrek) {
      if (usedEk.has(e.id)) continue;
      if (!shouldPairElectrekWithSx(s, e)) continue;
      usedEk.add(e.id);
      pairs.push({ sxId: s.id, ekId: e.id, title: s.title });
    }
  }
  return pairs;
}

function unionModels(a = [], b = []) {
  const out = [];
  for (const m of [...a, ...b]) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

function mergeLinks(target = [], incoming = []) {
  const links = [...target];
  const seen = new Set(links.map((l) => l.url));
  for (const link of incoming) {
    if (!link?.url || seen.has(link.url)) continue;
    seen.add(link.url);
    links.push({ title: link.title || "Source", url: link.url });
  }
  return links;
}

function enrichSx(sx, ek) {
  const links = mergeLinks(sx.links || [], ek.links || []);
  if (ek.releaseUrl && !links.some((l) => l.url === ek.releaseUrl)) {
    links.push({ title: "Electrek", url: ek.releaseUrl });
  }
  const records = [
    ...((sx.sourceRecords || []).filter((r) => r.id !== ek.id)),
    {
      id: ek.id,
      source: ELECTREK_SOURCE,
      version: ek.version,
      releaseDate: ek.releaseDate,
      url: ek.releaseUrl,
      title: ek.titleBeforeDedupe || ek.title,
      description: ek.descriptionBeforeDedupe || ek.description,
    },
  ];
  return {
    ...sx,
    image: sx.image || ek.image || null,
    imageDark: sx.imageDark || ek.imageDark || null,
    models: unionModels(sx.models, ek.models),
    links,
    sourceRecords: records,
    electrekDeduped: true,
  };
}

function alignElectrek(ek, sx) {
  return {
    ...ek,
    titleBeforeDedupe: ek.titleBeforeDedupe || ek.title,
    descriptionBeforeDedupe: ek.descriptionBeforeDedupe || ek.description,
    title: sx.title,
    description: sx.description,
    models: unionModels(ek.models, sx.models),
    dedupedInto: sx.id,
  };
}

function patchNested(releases, patchesById) {
  return (releases || []).map((rel) => {
    if (!rel?.features?.length) return rel;
    return {
      ...rel,
      features: rel.features.map((f) => {
        const patch = patchesById.get(f.id);
        return patch ? { ...f, ...patch } : f;
      }),
    };
  });
}

export function combineElectrekSxDuplicates(payload) {
  if (!payload?.features?.length) return payload;
  const features = [...payload.features];
  const byId = new Map(features.map((f, i) => [f.id, i]));
  const pairs = pairElectrekSxFeatures(features);
  const updatedById = new Map();

  for (const pair of pairs) {
    const sx = features[byId.get(pair.sxId)];
    const ek = features[byId.get(pair.ekId)];
    if (!sx || !ek) continue;
    const nextSx = enrichSx(sx, ek);
    const nextEk = alignElectrek(ek, nextSx);
    features[byId.get(pair.sxId)] = nextSx;
    features[byId.get(pair.ekId)] = nextEk;
    updatedById.set(nextSx.id, {
      title: nextSx.title,
      description: nextSx.description,
      models: nextSx.models,
      image: nextSx.image,
      imageDark: nextSx.imageDark,
      links: nextSx.links,
      sourceRecords: nextSx.sourceRecords,
      electrekDeduped: true,
    });
    updatedById.set(nextEk.id, {
      title: nextEk.title,
      description: nextEk.description,
      models: nextEk.models,
      titleBeforeDedupe: nextEk.titleBeforeDedupe,
      descriptionBeforeDedupe: nextEk.descriptionBeforeDedupe,
      dedupedInto: nextEk.dedupedInto,
    });
  }

  return {
    ...payload,
    features,
    releases: patchNested(payload.releases, updatedById),
    electrekSxDedupe: {
      paired: pairs.length,
    },
  };
}
