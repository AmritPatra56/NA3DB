import { test, expect } from "vitest";
import { groupsBySection, rowCount, groupAnchor, sourceClass, strandMiddle } from "../src/structure.js";

test("groups go to Molecules, Modified nucleotides or Ligands", () => {
  const groups = [{ kind: "RNA", polymer: true, rows: [1, 2] }, { kind: "Protein", polymer: true, rows: [1] },
                  { kind: "Modified", modified: true, rows: [1, 2, 3] }, { kind: "Ligand", rows: [] }];
  const s = groupsBySection({ groups });
  expect([s.molecules.length, s["modified-nucleotides"].length, s.ligands.length]).toEqual([2, 1, 1]);
  expect([rowCount(s.molecules), rowCount(s.ligands)]).toEqual([3, 0]);
});

test("anchors, classes and the strand label's middle", () => {
  expect(groupAnchor("molecules", "DNA/RNA hybrid")).toBe("molecules-dna-rna-hybrid");
  expect(sourceClass("Not natural")).toBe("source_not_natural");
  expect(strandMiddle({ x1: 10, x2: 25 })).toBe(17.5);
  expect(strandMiddle({ x1: 0.13, x2: 0.2 })).toBe(0.2);
});
