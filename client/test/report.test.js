import { test, expect } from "vitest";
import { registry } from "./registry.js";
import { tableOf, optionOn, firstTicks, fieldGroups, chosenFields, rowsPath, withParam, cellText } from "../src/report.js";
import { buildCsv, excelIds, fastaText, readmeText } from "../src/reportFiles.js";

const tables = registry.report_tables;
const [structures, molecules, ligands] = tables;

test("the table the address opens, and its option", () => {
  expect(tableOf(tables, "?table=ligands")).toBe(ligands);
  expect(tableOf(tables, "?table=nope")).toBe(structures);
  expect([optionOn(molecules, "?proteins=1"), optionOn(molecules, "?proteins=0"), optionOn(structures, "?proteins=1")]).toEqual([true, false, false]);
});

test("ticks start with Entry ID; fields keep table order and groups", () => {
  const ticks = firstTicks(tables, "pdb_id");
  expect(ticks.molecules[0]).toBe("pdb_id");
  expect(ticks.molecules.filter((k) => k === "pdb_id")).toHaveLength(1);
  expect(fieldGroups(structures).flatMap((g) => g.fields)).toEqual(structures.fields);
  expect(chosenFields(structures, ["method", "pdb_id"]).map((f) => f.key)).toEqual(["pdb_id", "method"]);
});

// Each path is the request :4000's report page sends for the address.
test("the rows are asked for as :4000 asks", () => {
  expect(rowsPath("?author_name=Smith&fields=closed", registry, structures)).toBe("/api/export?author_name=Smith");
  expect(rowsPath("?entry_id=1TTT&table=ligands&water=0", registry, ligands)).toBe("/api/export/ligands?entry_id=1TTT");
  expect(rowsPath("?q=tRNA&polymer_type=RNA,DNA&sort=resolution_asc&table=molecules&proteins=1&not_source_organism=Bacteria&match=exact&page=2", registry, molecules))
    .toBe("/api/export/molecules?q=tRNA&polymer_type=RNA%2CDNA&not_source_organism=Bacteria&match=exact&sort=resolution_asc&proteins=1");
});

test("address edits and cells", () => {
  expect(withParam("?q=a&table=x", "table", "ligands")).toBe("?q=a&table=ligands");
  expect(withParam("?q=a&water=1", "water", null)).toBe("?q=a");
  expect([cellText(null), cellText(undefined), cellText(0), cellText(2.5)]).toEqual(["", "", "0", "2.5"]);
});

test("CSV: a mark for Excel, quotes only where needed", () => {
  const csv = buildCsv([{ key: "a", label: "Entry ID" }, { key: "b", label: "Authors" }],
                       [{ a: "1TTT", b: "Ferré-D'Amaré, A." }, { a: "3E42", b: 'say "hi"' }, { a: null, b: "x\ny" }]);
  expect(csv).toBe("﻿Entry ID,Authors\r\n1TTT,\"Ferré-D'Amaré, A.\"\r\n3E42,\"say \"\"hi\"\"\"\r\n,\"x\ny\"\r\n");
  expect(excelIds(["1TTT", "3E42", "1e10", "E123"])).toEqual(["3E42", "1e10"]);
});

test("FASTA headers as the structure page writes them", () => {
  const seq = "A".repeat(85);
  expect(fastaText([
    { pdb_id: "1OB5", molecule_id: 2, chains: "B, D, F", molecule_name: "TRANSFER-RNA, PHE", organism: "Saccharomyces cerevisiae", taxonomy_id: 4932, sequence: seq },
    { pdb_id: "1OB5", molecule_id: 3, chains: "C", molecule_name: "", organism: "A; B", taxonomy_id: "1; 2", sequence: "GC" },
    { pdb_id: "1OB5", molecule_id: 4, chains: "", sequence: null },
  ])).toBe(`>1OB5_2|Chains B, D, F|TRANSFER-RNA, PHE|Saccharomyces cerevisiae (4932)\n${"A".repeat(80)}\nAAAAA\n>1OB5_3|Chain C|A; B\nGC\n`);
});

test("README: counts, options, and the lists only when there is something to list", () => {
  const base = { origin: "https://na3db.org", search: "q=tRNA", proteins: false, water: true,
                 counts: { structures: 3, molecules: 5, ligands: 2 }, dbn: { records: 3, unannotated: [] }, excel: [], date: "2026-11-26" };
  const lines = readmeText(base).split("\r\n");
  expect(lines.slice(0, 4)).toEqual(["NA3DB report", "", "Downloaded: 2026-11-26", "Search: https://na3db.org/search?q=tRNA"]);
  expect(lines).toContain("  molecules.csv    one row per molecule in a structure (5), nucleic acids only");
  expect(lines).toContain("  ligands.csv      one row per ligand in a structure (2), water included");
  expect(lines.some((l) => l.includes("No base-pair annotation") || l.includes("affected"))).toBe(false);
  expect(lines.slice(-2)).toEqual(["How to cite: https://na3db.org/cite", ""]);
  const more = readmeText({ ...base, dbn: { records: 1, unannotated: ["1ABC", "2DEF"] }, excel: ["3E42"] });
  expect(more).toContain("  No base-pair annotation yet, so no record: 1ABC 2DEF\r\n");
  expect(more).toContain("  Ids in this download that are affected: 3E42\r\n");
});
