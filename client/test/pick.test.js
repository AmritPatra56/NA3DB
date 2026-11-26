import { test, expect } from "vitest";
import { pickQuery, pickSummary, pickUrl, pickWords } from "../src/pick.js";

// The same rows as the server's pick.test.js, values as public/pick.js gives them.
const row = (key, values, label) => ({ key, values, label });
const DNA = row("polymer_type", ["DNA"], "DNA");
const RNA = row("polymer_type", ["RNA"], "RNA");
const XRAY = row("experimental_method", ["X-RAY DIFFRACTION"], "X-ray");
const NMR = row("experimental_method", ["SOLUTION NMR", "SOLID-STATE NMR"], "NMR");
const NOT_BACT = row("not_source_organism", ["Bacteria"], "Bacteria");
const NOT_ARCH = row("not_source_organism", ["Archaea"], "Archaea");

test("picks of one key merge, each value once; other keys stay apart", () => {
  expect([...pickQuery([DNA, XRAY, RNA, NMR])]).toEqual([
    ["polymer_type", ["DNA", "RNA"]],
    ["experimental_method", ["X-RAY DIFFRACTION", "SOLUTION NMR", "SOLID-STATE NMR"]],
  ]);
  expect([...pickQuery([DNA, DNA])]).toEqual([["polymer_type", ["DNA"]]]);
});

test("the line says the picks the way the search reads them", () => {
  expect(pickSummary([])).toBe("");
  expect(pickSummary([DNA, RNA])).toBe("(DNA or RNA)");
  expect(pickSummary([DNA, XRAY, RNA])).toBe("(DNA or RNA) and X-ray");
  expect(pickSummary([NOT_BACT, NOT_ARCH, DNA])).toBe("not (Bacteria or Archaea) and DNA");
  expect(pickSummary([XRAY], "tRNA")).toBe("“tRNA” and X-ray");
  expect(pickSummary([XRAY], "t")).toBe("X-ray");
});

test("the address runs the box and the picks together", () => {
  expect(pickUrl("", "tRNA", [DNA, RNA, XRAY])).toBe("q=tRNA&polymer_type=DNA%2CRNA&experimental_method=X-RAY+DIFFRACTION");
  expect(pickUrl("panel=open", "t", [NOT_BACT])).toBe("panel=open&not_source_organism=Bacteria");
  expect(pickUrl("", "", [DNA], { polymer_type: "DNA" })).toBe("polymer_type=DNA");
  expect(pickUrl("", "", [], { ligand: "MG" })).toBe("ligand=MG");
});

test("the count in words", () => {
  expect(pickWords(0)).toBe("No structures match");
  expect(pickWords(1)).toBe("1 structure");
  expect(pickWords(1489)).toBe("1,489 structures");
});
