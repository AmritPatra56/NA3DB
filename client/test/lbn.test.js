import { test, expect } from "vitest";
import map from "./seqmap4opj.json" with { type: "json" };
import { lbnLines, columnKey, columnWords, pairKey, pairColumns, strandsOf, scrollFor, rowsByPair, rowKey } from "../src/lbn.js";

test("the 4OPJ lines", () => {
  expect(lbnLines(map)).toEqual(["       B′           D", "seq    CGCGAaTTCGCG&CGCGAaTTCGCG", "WC     .((((((((((.&.))))))))))."]);
});

test("a column: its key, what it pairs with", () => {
  expect(columnKey(map, 3)).toBe("A:2 4");
  expect(columnWords(map, 0)).toEqual({ partners: [], head: "B′:DC1", items: [] });
  expect(columnWords(map, 3)).toEqual({ partners: [21], head: "B′:DG4", items: [{ col: 21, text: "D:DC9 (WC)" }] });
  expect(columnKey(map, 12)).toBe(null);
});

test("a pair from the table, found in the lines", () => {
  expect(pairKey("B 2", "A 1")).toBe(pairKey("A 1", "B 2"));
  expect(pairColumns(map, "A:2 4", columnKey(map, 21))).toEqual([3, 21]);
  expect(pairColumns(map, "A:2 4", "Z 1")).toBe(null);
  expect(strandsOf("A 4", "A 9")).toEqual(["A"]);
  expect(strandsOf("A 4", "B:2 9")).toEqual(["A", "B:2"]);
});

test("scrolling: both columns in sight when they fit, else the first in the middle", () => {
  const ruler = { width: 10, left: 5 };
  expect(scrollFor(10, 20, ruler, 300)).toBe(10);
  expect(scrollFor(20, 10, ruler, 300)).toBe(10);
  expect(scrollFor(10, 90, ruler, 300)).toBe(-45);
  expect(scrollFor(10, 20, ruler, 125)).toBe(42.5);
});

test("other pairs keyed by their pair, first row wins", () => {
  const rows = rowsByPair([{ ends: ["A 1", "A 9"], family: "tWH" }, { ends: ["A 9", "A 1"], family: "cSS" }, { ends: ["A 2", "A 8"], family: "cWW" }]);
  expect([...rows]).toEqual([[pairKey("A 1", "A 9"), "A 1|A 9|tWH"], [pairKey("A 2", "A 8"), "A 2|A 8|cWW"]]);
  expect(rowKey({ ends: ["x", "y"], family: "f" })).toBe("x|y|f");
});
