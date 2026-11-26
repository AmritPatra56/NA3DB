import { test, expect } from "vitest";
import { resolution, methodShort, sortedEntries, refName, leadText, modelled } from "../src/sameSeq.js";

const chain = (id, name) => ({ id, name, seen: 76, length: 76, confal: null });
const group = { kind: "RNA", length: 76, ref: "A", entries: [
  { entry: "4TNA", this: false, resolution: 2.5, chains: [chain("X", "x")] },
  { entry: "1EHZ", this: false, resolution: 1.93, chains: [chain("Y", "y")] },
  { entry: "1TTT", this: true, resolution: 2.7, chains: [chain("A", "tRNA-Phe")] },
  { entry: "1A00", this: false, resolution: null, chains: [] },
  { entry: "0ZZZ", this: false, resolution: null, chains: [] },
] };

test("numbers and methods as the old sameseq.js writes them", () => {
  expect([resolution(1.934), resolution(12.34), resolution(null)]).toEqual(["1.93 Å", "12.3 Å", null]);
  expect([methodShort("X-RAY DIFFRACTION"), methodShort("SOLUTION NMR"), methodShort(null)]).toEqual(["x-ray", "nmr", "unknown method"]);
});

test("this page first, then best resolution, then id", () => {
  expect(sortedEntries(group).map((e) => e.entry)).toEqual(["1TTT", "1EHZ", "4TNA", "0ZZZ", "1A00"]);
  expect(refName(group)).toBe("tRNA-Phe");
});

test("the line over the table", () => {
  expect(leadText(group, false)).toEqual({ head: null, text: "4 other entries have an RNA chain with exactly the sequence of tRNA-Phe, 76 nt." });
  const one = { ...group, kind: "DNA", entries: group.entries.slice(1, 3) };
  expect(leadText(one, true)).toEqual({ head: "DNA, 76 nt.", text: "1 other entry has a DNA chain with exactly the sequence of tRNA-Phe, 76 nt." });
});

test("how much of a chain is modelled", () => {
  expect(modelled({ seen: 76, length: 76, confal: null })).toBe("all 76 nt modelled");
  expect(modelled({ seen: 70, length: 76, confal: 81 })).toBe("70 of 76 nt modelled · confal 81");
});
