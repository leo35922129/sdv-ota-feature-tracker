/**
 * Vehicle Model filter options and matching against canonical `models` arrays.
 * Tesla/Rivian badges stay S/3/X/Y/CT and R1S/R1T/R2; the selector displays
 * established labels without rewriting records.
 */

export const VEHICLE_MODEL_OPTIONS = {
  tesla: [
    { value: "all", label: "All Vehicles" },
    { value: "3", label: "Model 3" },
    { value: "Y", label: "Model Y" },
    { value: "S", label: "Model S" },
    { value: "X", label: "Model X" },
    { value: "CT", label: "Cybertruck" },
  ],
  rivian: [
    { value: "all", label: "All Vehicles" },
    { value: "R1S", label: "R1S" },
    { value: "R1T", label: "R1T" },
    { value: "R2", label: "R2" },
  ],
};

export function vehicleModelOptionsForBrand(brand) {
  return VEHICLE_MODEL_OPTIONS[brand] || VEHICLE_MODEL_OPTIONS.tesla;
}

export function vehicleModelLabel(brand, value) {
  return (
    vehicleModelOptionsForBrand(brand).find((o) => o.value === value)?.label ||
    "All Vehicles"
  );
}

export function isValidVehicleModel(brand, value) {
  return vehicleModelOptionsForBrand(brand).some((o) => o.value === value);
}

/** A group matches when coverage includes the selected model. All Vehicles = every group. */
export function groupMatchesModel(group, model) {
  if (!model || model === "all") return true;
  return (group?.models || []).includes(model);
}

export function filterGroupsByModel(groups, model) {
  if (!model || model === "all") return [...(groups || [])];
  return (groups || []).filter((g) => groupMatchesModel(g, model));
}
