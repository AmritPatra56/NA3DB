import { test, expect } from "vitest";
import { registry } from "./registry.js";
import { chipsOf, withoutChip } from "../src/chips.js";
import { panelFromParams } from "../src/panelForm.js";

const texts = (filters) => chipsOf(filters, registry).map((c) => c.text);

// Texts as app.js chip_text writes them on :4000.
test("one chip per value, named from the registry", () => {
  expect(texts({ experimental_method: ["X-RAY DIFFRACTION", "SOLUTION NMR"] })).toEqual(["Experimental method: X-ray", "Experimental method: NMR"]);
  expect(texts({ resolution_min: "1.5", resolution_max: "3" })).toEqual(["Resolution (Å) ≥ 1.5", "Resolution (Å) ≤ 3"]);
  expect(texts({ author_name: "Smith", ligand: "" })).toEqual(["Author name: Smith"]);
});

test("the prominent box gives no chip; a turned-round filter reads not", () => {
  expect(texts({ q: "tRNA" })).toEqual([]);
  expect(texts({ not_source_organism: "Bacteria,Archaea" })).toEqual(["Source organism: not Bacteria", "Source organism: not Archaea"]);
});

test("removing a chip: a pill leaves its group (Any when none is left), a box empties, a not_ value goes", () => {
  const panel = panelFromParams(new URLSearchParams("polymer_type=DNA,RNA&author_name=Smith"), registry);
  const excluded = { not_source_organism: "Bacteria,Archaea" };
  let r = withoutChip(panel, excluded, registry, { key: "polymer_type", value: "DNA" });
  expect(r.form.values.polymer_type).toEqual(["RNA"]);
  r = withoutChip(r.form, excluded, registry, { key: "polymer_type", value: "RNA" });
  expect(r.form.values.polymer_type).toEqual(["any"]);
  expect(withoutChip(panel, excluded, registry, { key: "author_name", value: "Smith" }).form.values.author_name).toBe("");
  r = withoutChip(panel, excluded, registry, { key: "not_source_organism", value: "Bacteria" });
  expect(r.excluded).toEqual({ not_source_organism: "Archaea" });
  expect(withoutChip(panel, r.excluded, registry, { key: "not_source_organism", value: "Archaea" }).excluded).toEqual({});
});
