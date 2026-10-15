#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VEHICLE_MODEL_OPTIONS,
  groupMatchesModel,
  filterGroupsByModel,
  isValidVehicleModel,
  vehicleModelLabel,
} from "./vehicle-model-filter.mjs";

test("Tesla and Rivian selector options are brand-specific", () => {
  assert.deepEqual(
    VEHICLE_MODEL_OPTIONS.tesla.map((o) => o.label),
    ["All Vehicles", "Model 3", "Model Y", "Model S", "Model X", "Cybertruck"]
  );
  assert.deepEqual(
    VEHICLE_MODEL_OPTIONS.rivian.map((o) => o.label),
    ["All Vehicles", "R1S", "R1T", "R2"]
  );
  assert.equal(isValidVehicleModel("tesla", "R1S"), false);
  assert.equal(isValidVehicleModel("rivian", "3"), false);
  assert.equal(vehicleModelLabel("tesla", "3"), "Model 3");
  assert.equal(vehicleModelLabel("rivian", "R2"), "R2");
});

test("shared coverage appears under each included model without duplicating the group", () => {
  const groups = [
    { title: "S only", models: ["S"] },
    { title: "S/X", models: ["S", "X"] },
    { title: "S/X/3", models: ["S", "X", "3"] },
    { title: "Y only", models: ["Y"] },
    { title: "Cybertruck", models: ["CT"] },
    { title: "Unknown", models: [] },
  ];
  assert.equal(filterGroupsByModel(groups, "all").length, 6);
  assert.deepEqual(
    filterGroupsByModel(groups, "S").map((g) => g.title),
    ["S only", "S/X", "S/X/3"]
  );
  assert.deepEqual(
    filterGroupsByModel(groups, "X").map((g) => g.title),
    ["S/X", "S/X/3"]
  );
  assert.deepEqual(
    filterGroupsByModel(groups, "3").map((g) => g.title),
    ["S/X/3"]
  );
  assert.deepEqual(
    filterGroupsByModel(groups, "Y").map((g) => g.title),
    ["Y only"]
  );
  assert.deepEqual(
    filterGroupsByModel(groups, "CT").map((g) => g.title),
    ["Cybertruck"]
  );
  assert.equal(groupMatchesModel(groups[5], "3"), false);
  assert.equal(groupMatchesModel(groups[5], "all"), true);
});

test("Rivian model matching uses canonical R1S/R1T/R2 values", () => {
  const groups = [
    { title: "R1 shared", models: ["R1S", "R1T"] },
    { title: "R2", models: ["R2"] },
  ];
  assert.deepEqual(
    filterGroupsByModel(groups, "R1S").map((g) => g.title),
    ["R1 shared"]
  );
  assert.deepEqual(
    filterGroupsByModel(groups, "R2").map((g) => g.title),
    ["R2"]
  );
});
