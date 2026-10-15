import test from "node:test";
import assert from "node:assert/strict";
import {
  appendYear,
  appendFeature,
  removeYear,
  removeFeature,
  defaultSimulatorDraft,
  isDefaultYear,
  computeSimulatorMetrics,
  countEnteredYears,
  draftToState,
  formatFleetCompact,
  formatPerVehicleAmount,
  parseSimulatorNumber,
  periodsForCadence,
} from "./digital-revenue-simulator.mjs";

function stateFromInputs(partial) {
  /** @type {import('./digital-revenue-simulator.mjs').SimulatorDraft} */
  const draft = {
    hardwareInvestmentPerVehicle: "",
    years: partial.years.map((y) => ({ id: y.id, label: y.label, fleet: y.fleet ?? "" })),
    features: partial.features.map((f) => ({
      id: f.id,
      name: f.name,
      cadence: f.cadence,
      prices: { ...f.prices },
      adoptions: { ...f.adoptions },
    })),
  };
  return draftToState(draft);
}

test("calculation test 1: one feature, one year", () => {
  const state = stateFromInputs({
    years: [{ id: "y1", label: "Year 1", fleet: "1.64M" }],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99" },
        adoptions: { y1: "100" },
      },
    ],
  });
  const m = computeSimulatorMetrics(state);
  assert.equal(m.features[0].featureRevenuePerSubscribedVehicle, 1188);
  assert.equal(m.totalRevenuePerSubscribedVehicle, 1188);
  assert.equal(m.features[0].featureFleetRevenue, 99 * 12 * 1_640_000);
  assert.equal(formatFleetCompact(m.features[0].featureFleetRevenue), "$1.95B");
  assert.equal(formatFleetCompact(m.totalFleetRevenue), "$1.95B");
});

test("calculation test 2: cumulative pricing", () => {
  const state = stateFromInputs({
    years: [
      { id: "y1", label: "Year 1", fleet: "" },
      { id: "y2", label: "Year 2", fleet: "" },
      { id: "y3", label: "Year 3", fleet: "" },
    ],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99", y2: "149", y3: "169" },
        adoptions: { y1: "", y2: "", y3: "" },
      },
    ],
  });
  const m = computeSimulatorMetrics(state);
  assert.equal(m.features[0].featureRevenuePerSubscribedVehicle, 5004);
  assert.equal(99 * 12, 1188);
  assert.equal(149 * 12, 1788);
  assert.equal(169 * 12, 2028);
});

test("calculation test 3: two features and adoption", () => {
  const state = stateFromInputs({
    years: [{ id: "y1", label: "Year 1", fleet: "1.64M" }],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99" },
        adoptions: { y1: "58" },
      },
      {
        id: "pc",
        name: "Premium Connectivity",
        cadence: "monthly",
        prices: { y1: "9.90" },
        adoptions: { y1: "90" },
      },
    ],
  });
  const m = computeSimulatorMetrics(state);
  assert.ok(Math.abs(m.features[0].featureFleetRevenue - 1_130_025_600) < 1);
  assert.ok(Math.abs(m.features[1].featureFleetRevenue - 175_348_800) < 1);
  assert.ok(Math.abs(m.totalFleetRevenue - 1_305_374_400) < 1);
});

test("calculation test 4: reference scenario totals", () => {
  const state = stateFromInputs({
    years: [
      { id: "y1", label: "Year 1", fleet: "1.64M" },
      { id: "y2", label: "Year 2", fleet: "1.82M" },
      { id: "y3", label: "Year 3", fleet: "2.23M" },
    ],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99", y2: "149", y3: "169" },
        adoptions: { y1: "58", y2: "67", y3: "60" },
      },
      {
        id: "pc",
        name: "Premium Connectivity",
        cadence: "monthly",
        prices: { y1: "9.90", y2: "9.90", y3: "19.90" },
        adoptions: { y1: "90", y2: "95", y3: "70" },
      },
    ],
  });
  const m = computeSimulatorMetrics(state);
  assert.equal(m.features[0].featureRevenuePerSubscribedVehicle, 5004);
  assert.ok(Math.abs(m.features[1].featureRevenuePerSubscribedVehicle - 476.4) < 0.01);
  assert.ok(Math.abs(m.totalRevenuePerSubscribedVehicle - 5480.4) < 0.01);
  assert.equal(formatPerVehicleAmount(m.totalRevenuePerSubscribedVehicle), "$5,480.40");
  assert.ok(m.features[0].featureFleetRevenue > 6_000_000_000);
  assert.ok(m.features[1].featureFleetRevenue > 700_000_000);
  assert.ok(m.totalFleetRevenue > 6_700_000_000);
});

test("parse compact fleet values and adoption percent", () => {
  assert.equal(parseSimulatorNumber("1.64M", { allowCompact: true }), 1_640_000);
  assert.equal(parseSimulatorNumber("58", { isPercent: true }), 58);
  assert.equal(periodsForCadence("monthly"), 12);
  assert.equal(periodsForCadence("annual"), 1);
});

test("append year and feature preserve existing values", () => {
  let draft = stateFromInputs({
    years: [{ id: "y1", label: "Year 1", fleet: "100" }],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99" },
        adoptions: { y1: "50" },
      },
    ],
  });
  /** @type {import('./digital-revenue-simulator.mjs').SimulatorDraft} */
  const d = {
    hardwareInvestmentPerVehicle: "",
    years: [{ id: "y1", label: "Year 1", fleet: "100" }],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99" },
        adoptions: { y1: "50" },
      },
    ],
  };
  appendYear(d, 2);
  assert.equal(d.years.length, 2);
  assert.equal(d.features[0].prices[d.years[1].id], "");
  appendFeature(d);
  assert.equal(d.features.length, 2);
  appendYear(d, 3);
  const removedId = d.years[0].id;
  removeYear(d, removedId);
  assert.equal(d.years.length, 2);
  assert.equal(d.years[0].label, "Year 1");
  assert.equal(d.years[1].label, "Year 2");
  assert.equal(d.features[0].prices[removedId], undefined);
  removeYear(d, d.years[0].id);
  removeYear(d, d.years[0].id);
  assert.equal(d.years.length, 1);
  const removedFeatureId = d.features[1].id;
  removeFeature(d, removedFeatureId);
  assert.equal(d.features.length, 1);
  assert.equal(d.features.some((feature) => feature.id === removedFeatureId), false);
});

test("default Year 1-4 cannot be deleted", () => {
  const draft = defaultSimulatorDraft();
  appendYear(draft, 5);
  removeYear(draft, "drs-year-default-2");
  assert.equal(draft.years.length, 5);
  assert.equal(isDefaultYear("drs-year-default-1"), true);
  const addedId = draft.years[4].id;
  removeYear(draft, addedId);
  assert.equal(draft.years.length, 4);
  assert.equal(draft.years.map((year) => year.id).join(","), "drs-year-default-1,drs-year-default-2,drs-year-default-3,drs-year-default-4");
});

test("key takeaway year count follows entered year numbers", () => {
  const draft = {
    hardwareInvestmentPerVehicle: "",
    years: [
      { id: "y1", label: "Year 1", fleet: "100" },
      { id: "y2", label: "Year 2", fleet: "" },
      { id: "y3", label: "Year 3", fleet: "" },
      { id: "y4", label: "Year 4", fleet: "" },
    ],
    features: [
      {
        id: "fsd",
        name: "FSD",
        cadence: "monthly",
        prices: { y1: "99", y2: "99", y3: "", y4: "" },
        adoptions: { y1: "", y2: "", y3: "10", y4: "" },
      },
    ],
  };
  assert.equal(countEnteredYears(draft), 3);
  draft.years[1].fleet = "";
  draft.features[0].prices.y2 = "";
  assert.equal(countEnteredYears(draft), 2);
  draft.features[0].adoptions.y3 = "";
  draft.years[0].fleet = "";
  draft.features[0].prices.y1 = "";
  assert.equal(countEnteredYears(draft), 0);
});
