import { test, expect } from "vitest";
import entry from "./entry1ttt.json" with { type: "json" };
import { cardParts, lineParts, tileFacts, methodLabel, resolutionText, yearOf, entryHref } from "../src/resultCard.js";

test("the 1TTT card says what :4000's card says", () => {
  const p = cardParts(entry);
  expect(p.when).toBe("X-ray 2.70 Å · 1995");
  expect(p.facts).toEqual([["Method", "X-ray · 2.70 Å"], ["Deposited", "1995"], ["Nucleotides", "228"],
    ["Base pairs", { n: "82", wc: "59" }], ["Modified", "42"], ["Strands", "3"]]);
  expect(p.brief).toBe("Nissen et al. · Science 1995 · Thermus aquaticus");
  expect(p.residues).toEqual(["1MA", "2MG", "5MC", "5MU", "7MG", "H2U", "M2G", "OMC", "OMG", "PSU", "YYG"]);
  expect(p.ligandChip).toBe("+3 ligands");
  expect(p.rows.map((r) => r.key)).toEqual(["all_authors", "published", "entity_name", "source_organism", "nonstandard_residue", "ligands"]);
});

test("a card with no pairs annotated and one ligand", () => {
  const card = [{ key: "all_authors", value: "Lee, K." }, { key: "ligands", value: "MG" }, { key: "title", value: "t", searched: true }];
  const p = cardParts({ ...entry, arcs: null, resolution: null, card });
  expect(p.facts).toEqual([["Method", "X-ray"], ["Deposited", "1995"], ["Base pairs", "None annotated"]]);
  expect([p.brief, p.ligandChip, p.nums]).toEqual(["Lee K", "+1 ligand", []]);
  expect(p.rows.map((r) => r.key)).toEqual(["all_authors", "ligands", "title"]);
});

test("lines, tiles and the short forms", () => {
  expect(lineParts(entry)).toEqual({ method: "X-ray", resolution: "2.70 Å", date: "1995-11-16" });
  expect(tileFacts(entry)).toBe("X-ray · 2.70 Å · 1995");
  expect(tileFacts({ method: "SOLUTION NMR", resolution: null, deposition_date: null })).toBe("NMR");
  expect([methodLabel("SOLUTION NMR"), methodLabel("SOMETHING NEW")]).toEqual(["NMR", "SOMETHING NEW"]);
  expect([resolutionText(3), resolutionText(null), yearOf(""), entryHref("1 A")]).toEqual(["3.00 Å", null, "", "/structure/1%20A"]);
});
