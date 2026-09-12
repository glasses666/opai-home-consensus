import assert from "node:assert/strict";
import { calculateComparison } from "./tv-wall-comparison.mjs";

const result = calculateComparison();
const byKey = new Map(result.variants.map((variant) => [variant.key, variant]));
const comparisons = new Map(result.comparisons.map((item) => [item.key, item]));

assert.equal(byKey.get("full-wall").centerClearance.reclinedM, 1.15);
assert.equal(byKey.get("shallow-full-wall").centerClearance.reclinedM, 1.2);
assert.equal(comparisons.get("shallow-full-wall").centerClearanceReclinedChangeMm, 50);
assert.equal(byKey.get("full-wall").livingFacadeCoveragePct, 77.1);
assert.equal(byKey.get("balanced").livingFacadeCoveragePct, 45.8);
assert.equal(comparisons.get("balanced").livingStorageChangePct, -42.9);
assert.equal(comparisons.get("balanced-with-entry").wholeHomeStorageChangePct, 0.4);
assert.equal(comparisons.get("balanced-with-entry").quantityProxyChangePct, 2.7);

console.log("tv-wall comparison calculations verified");
