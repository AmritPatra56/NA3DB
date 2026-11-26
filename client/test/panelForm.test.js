import { test, expect } from "vitest";
import { registry } from "./registry.js";
import { panelFromParams, withValue, withPill, withPills, filtersOfPanel, fieldsOf, pillsOf } from "../src/panelForm.js";

const from = (search) => panelFromParams(new URLSearchParams(search), registry);
const method = registry.filters.find((f) => f.key === "experimental_method");

test("a link sets each box, a range only if it is a number", () => {
  const p = from("q=tRNA&author_name=Smith&confal_min=abc&confal_max=80");
  expect(p.values.q).toBe("tRNA");
  expect(p.values.author_name).toBe("Smith");
  expect(p.values.confal_min).toBe("");
  expect(p.values.confal_max).toBe("80");
});

test("a pill group takes the link's values it offers, Any when it names none", () => {
  const p = from("polymer_type=RNA,NOPE,DNA&has_water=With water");
  expect(p.values.polymer_type).toEqual(["DNA", "RNA"]);
  expect(p.values.experimental_method).toEqual(["any"]);
  // A group with no Any pill starts with none on.
  expect(p.values.has_water).toEqual(["With water"]);
  expect(from("").values.has_water).toEqual([]);
});

test("resolution shows only while a method that has one is on, or a link fills it", () => {
  expect(from("").shown.resolution_min).toBe(false);
  expect(from("experimental_method=X-RAY DIFFRACTION").shown.resolution_min).toBe(true);
  expect(from("experimental_method=SOLUTION NMR").shown.resolution_min).toBe(false);
  const filled = from("resolution_max=2");
  expect(filled.shown.resolution_min).toBe(true);
  expect(filled.values.resolution_max).toBe("2");
});

test("Any clears the rest; another pill clears Any and toggles itself", () => {
  let p = from("");
  p = withPill(p, registry, "polymer_type", "DNA");
  expect(p.values.polymer_type).toEqual(["DNA"]);
  p = withPill(p, registry, "polymer_type", "RNA");
  expect(p.values.polymer_type).toEqual(["DNA", "RNA"]);
  p = withPill(p, registry, "polymer_type", "DNA");
  expect(p.values.polymer_type).toEqual(["RNA"]);
  p = withPill(p, registry, "polymer_type", "any");
  expect(p.values.polymer_type).toEqual(["any"]);
});

test("turning the last method with a resolution off hides it and empties both boxes", () => {
  let p = withPills(from(""), registry, "experimental_method", ["X-RAY DIFFRACTION"]);
  p = withValue(withValue(p, "resolution_min", "1"), "resolution_max", "3");
  expect(p.shown.resolution_min).toBe(true);
  p = withPill(p, registry, "experimental_method", "X-RAY DIFFRACTION");
  expect(p.shown.resolution_min).toBe(false);
  expect([p.values.resolution_min, p.values.resolution_max]).toEqual(["", ""]);
});

test("the filters asked: boxes trimmed, pills without Any, in drawn order", () => {
  const p = withValue(from("polymer_type=RNA,DNA"), "author_name", "  Smith ");
  const f = filtersOfPanel(p, registry);
  expect(f.author_name).toBe("Smith");
  expect(f.polymer_type).toEqual(["DNA", "RNA"]);
  expect(f.experimental_method).toEqual([]);
});

test("a category draws its fields once, a range with its partner beside it", () => {
  const demo = fieldsOf(registry, registry.groups.find((g) => g.name === "Demographics"));
  expect(demo.map((f) => f.key)).toEqual(["entry_id", "author_name", "experimental_method", "resolution_min"]);
  expect(demo[3].partner.key).toBe("resolution_max");
});

test("a pill no entry has is left out unless the link picked it; past first are extra", () => {
  const counts = { experimental_method: { "X-RAY DIFFRACTION": 900, "SOLUTION NMR": 300 } };
  const shown = pillsOf(method, counts, []).options.map((o) => [o.value, o.count, o.extra]);
  expect(shown).toEqual([["X-RAY DIFFRACTION", 900, false], ["SOLUTION NMR", 300, false]]);
  expect(pillsOf(method, counts, ["FIBER DIFFRACTION"]).options.map((o) => o.value)).toContain("FIBER DIFFRACTION");
  const before = pillsOf(method, null, []).options;
  expect(before.every((o) => o.count === null)).toBe(true);
  expect(before.findIndex((o) => o.extra)).toBe(4);
});
