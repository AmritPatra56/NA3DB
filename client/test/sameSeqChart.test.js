import { test, expect } from "vitest";
import d from "./compare1ttt.json" with { type: "json" };
import { W, chartOf, lookupOf, columnAt, scrollFor, firstOther, comparePath } from "../src/sameSeqChart.js";

// compare1ttt.json: :4000's /api/same_sequence/compare?a=1TTT:A&b=4V4R:B.
// The expected numbers are the ones in the chart :4000 draws for it.
const c = chartOf(d, W);

test("size and labels", () => {
  expect([c.width, c.height]).toEqual([1074, 286]);
  expect(c.labels.map((l) => `${l.y}:${l.text}`)).toEqual(["13:differences", "102:A backbone", "126:sequence", "150:B backbone",
    "180:WC", "196:cWW", "212:tWW", "228:tWH", "244:tHW", "260:tHH", "276:tSS"]);
});

test("ruler, letters, numbers and tints", () => {
  // y is the ruler line; SameSeqChart draws the numbers 8 above it (78 in the svg).
  expect(c.ruler.map((r) => `${r.x}:${r.y + 8}:${r.num}`)).toEqual(["133:78:10", "273:78:20", "413:78:30", "553:78:40", "693:78:50", "833:78:60", "973:78:70"]);
  expect(c.letters.map((l) => [l.kind, l.text.length, l.x.split(" ").slice(0, 3).join(" ")])).toEqual([["seen", 62, "7 21 35"], ["mod", 14, "133 217 231"]]);
  expect(c.marks).toHaveLength(64);
  const tints = c.rows.flatMap((r) => r.tints.map((t) => ({ ...t, y: r.tintY })));
  expect(tints).toHaveLength(44);
  expect(tints.slice(0, 2)).toMatchObject([{ x: 0.5, y: 169, cls: "ss_only_a" }, { x: 994.5, y: 169, cls: "ss_only_a" }]);
  expect(c.rows[0].marks[0]).toMatchObject({ text: "(((((((((([))))(((())))(((((])))))))))))" });
  expect(c.rows[0].marks[0].x.startsWith("7 21 35 63")).toBe(true);
  expect(c.rows[1].marks[0]).toMatchObject({ x: "49 959", text: "()" });
});

test("what a column has, both ways", () => {
  const look = lookupOf(d);
  expect(look.links[1].map((l) => l.to)).toEqual([...look.links[1].map((l) => l.to)].sort((p, q) => p - q));
  expect(look.at.flat().length).toBeGreaterThanOrEqual(d.diffs.length);
  expect(look.name(0)).toBe(`${d.cols[0][0].toUpperCase()}${d.cols[0][1]}`);
});

test("pointer, scroll and the first B", () => {
  expect([columnAt({ left: 10 }, 9, 14, 76), columnAt({ left: 10 }, 24, 14, 76), columnAt({ left: 10 }, 2000, 14, 76)]).toEqual([null, 1, null]);
  expect(scrollFor({ cols: [10, 12] }, 14, 500, false)).toEqual({ left: 0, long: false });
  expect(scrollFor({ cols: [50, 52] }, 14, 500, false)).toEqual({ left: 510, long: false });
  expect(scrollFor({ cols: [0, 75] }, 14, 500, false)).toEqual({ left: 0, long: true });
  const group = { ref: "1TTT:A", entries: [{ chains: [{ id: "1TTT:A" }, { id: "1TTT:B" }] }, { chains: [{ id: "4V4R:B" }] }] };
  expect(firstOther(group)).toBe("4V4R:B");
  expect(firstOther({ ref: "1TTT:A", entries: [{ chains: [{ id: "1TTT:A" }, { id: "1TTT:B" }] }] })).toBe("1TTT:B");
  expect(comparePath("1TTT:A", "4V4R:B")).toBe("/api/same_sequence/compare?a=1TTT%3AA&b=4V4R%3AB");
});
