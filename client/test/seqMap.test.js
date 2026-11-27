import { test, expect } from "vitest";
import map from "./seqmap4opj.json" with { type: "json" };
import { W, prepare, drawingOf, fitWidth, zoomed, viewBox, strandNote, strandsAfter, quickPick, classKey } from "../src/seqMap.js";

const p = prepare(map);
const dr = drawingOf(map, p, W);

test("the size, the ruler and the strand break", () => {
  expect([dr.width, dr.height, dr.wide]).toEqual([350, 92, true]);
  expect(dr.ruler.map((r) => [r.x, r.strand ?? r.num])).toEqual([[1, "B′ 5′"], [133, 10], [183, "D 5′"], [315, 10]]);
  expect(dr.seps.map((s) => s.x)).toEqual([175]);
});

test("the letters by kind", () => {
  expect(dr.letters).toEqual([
    { kind: "seen", x: "7 21 35 49 63 91 105 119 133 147 161 189 203 217 231 245 273 287 301 315 329 343", text: "CGCGATTCGCGCGCGATTCGCG" },
    { kind: "mod", x: "77 259", text: "aa" },
  ]);
});

test("NtC bars: a pale box with no NtC, one colour or two halves", () => {
  const rects = dr.bars.flatMap((b) => b.rects ?? []);
  expect(rects).toHaveLength(29);
  expect(rects[0]).toMatchObject({ x: 9.5, y: 55.5, width: 9, height: 10, fill: "#F2F2F2" });
  expect(rects[1]).toMatchObject({ x: 23, y: 48.58, width: 10, fill: "#C8CFFF", className: "ntc_bar" });
  expect(rects[1].height).toBeCloseTo(17.42);
  const halves = rects.filter((r) => r.width === 5);
  expect(halves[0]).toMatchObject({ x: 191, fill: "#FFEBA1" });
  expect(halves[1]).toMatchObject({ x: 196, fill: "#C8CFFF" });
});

test("the pair row", () => {
  expect(dr.rows).toHaveLength(1);
  expect(dr.rows[0]).toMatchObject({ y: 84, dots: "7 161 189 343", dotText: "....", markText: "(((((((((())))))))))",
    marks: "21 35 49 63 77 91 105 119 133 147 203 217 231 245 259 273 287 301 315 329" });
});

test("between the section width and letters giving way: bars narrow, numbers keep off the strand names", () => {
  expect(drawingOf(map, p, 10).bars[1].rects[0].width).toBeCloseTo(10 * 10 / 14);
  expect(drawingOf(map, p, 3.6).ruler.map((r) => r.strand ?? r.num)).toEqual(["B′ 5′", "D 5′"]);
});

test("narrow columns trade letters for lines and ticks", () => {
  const thin = drawingOf(map, p, 2);
  expect([thin.wide, thin.letters]).toEqual([false, []]);
  expect(thin.lines.runs).toEqual([{ x: 0, width: 24 }, { x: 26, width: 24 }]);
  expect(thin.lines.mod).toEqual([10, 36]);
});

test("zoom and the overview box", () => {
  expect(fitWidth(1000, 25)).toBe(W);
  expect(fitWidth(300, 1000)).toBeCloseTo(0.252);
  expect(zoomed(14, 28, 0, 344, 25, 0)).toEqual({ w: 28, left: 0 });
  expect(zoomed(14, 99, 100, 344, 25, 150)).toEqual({ w: 28, left: 350 });
  expect(viewBox(140, 344, 14, 25)).toEqual({ x: 10, width: 300 / 14 });
});

test("the strand chips", () => {
  const b2 = map.strands.find((s) => s.key === "A:2");
  expect(strandNote(map, b2)).toBe("12 nt · pairs with D");
  expect(strandNote(map, map.strands[0])).toBe("12 nt · no pairs");
  expect(strandsAfter(map, map.strands[0])).toEqual(["A", ...map.shown]);
  expect(strandsAfter(map, b2)).toEqual(map.shown.filter((k) => k !== "A:2"));
  expect(quickPick(map, "all")).toEqual(map.strands.map((s) => s.key));
  expect(classKey(["NANT"]).map((k) => k.code)).toEqual(["N"]);
  expect(classKey(map.steps.map((s) => s.ntc).filter(Boolean)).map((k) => k.code)).toEqual(["A", "B", "miB"]);
});
