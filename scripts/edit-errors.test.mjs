#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainEditFailure } from "./edit-errors.mjs";

test("rewrites Safari URL pattern errors so they are not blamed on feature name", () => {
  const msg = explainEditFailure(
    new Error("The string did not match the expected pattern.")
  );
  assert.match(msg, /image URL/i);
  assert.doesNotMatch(msg, /did not match the expected pattern/i);
});

test("passes through ordinary save errors", () => {
  assert.equal(
    explainEditFailure(new Error("Select at least one category tag.")),
    "Select at least one category tag."
  );
});
