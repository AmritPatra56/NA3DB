import { test, expect } from "vitest";
import d from "./arcs1ttt.json" with { type: "json" };
import { frameOf, layoutOf, FIT, zoomBy, panTo, drawing, letters, ruler, under, familyWords, glyphOf } from "../src/arcView.js";

// arcs1ttt.json: :4000's /api/entries/1TTT/arcs?assembly=1. The expected
// numbers are the ones :4000's expanded arc viewer draws for it, at the
// size it opened (an svg 281 by 429 on screen).
const f = frameOf(281.09375, 428.546875, d);
const L = layoutOf(d, f.W);

test("the frame: a floor of 300 by 220, room under the line for the crossing pairs", () => {
  expect(f).toEqual({ W: 300, H: 220, depth: 44, base: 118 });
  expect(d.pairs.filter(under)).toHaveLength(5);
  expect(frameOf(1000, 900, { pairs: [] })).toEqual({ W: 1000, H: 600, depth: 0, base: 542 });
});

test("at fit: the line, the first arc, the symbols and the ruler", () => {
  const dr = drawing(d, f, L, FIT);
  expect(dr.strands).toEqual([[22, 278]]);
  expect(dr.arcs).toHaveLength(25);
  expect(dr.arcs[0].path).toBe("M23.7 118C23.7 -11.8 262.8 -11.8 262.8 118");
  expect(dr.arcs.filter((a) => a.symbol)).toHaveLength(4);
  expect(ruler(d, f, L, FIT)[0].ticks.map((t) => [t.x.toFixed(3), t.p])).toEqual([["87.684", 20], ["155.053", 40], ["222.421", 60]]);
  // Too narrow for letters: only the modified residues, as dots.
  expect(letters(d, f, L, FIT).every((l) => l.letter === null && l.mod)).toBe(true);
});

test("zooming in keeps the middle, and the ruler counts closer", () => {
  const z = zoomBy(FIT, 1.6, f.W / 2, L, f.W);
  expect(z).toEqual({ s: 1.6, tx: -90 });
  expect(ruler(d, f, L, z)[0].ticks.slice(0, 2).map((t) => [t.x.toFixed(3), t.p])).toEqual([["50.295", 20], ["104.189", 30]]);
  // Ticks stay at least 44 apart: at 2.56 a step of 5 would be 43, so they count in tens (3 on screen, as :4000 draws).
  const twice = zoomBy(z, 1.6, f.W / 2, L, f.W);
  expect(ruler(d, f, L, twice)[0].ticks.map((t) => t.p)).toEqual([30, 40, 50]);
  // Never past the fit, never off either end.
  expect(zoomBy(FIT, 0.5, 150, L, f.W)).toEqual(FIT);
  expect(panTo(z, 50, f.W).tx).toBe(0);
  expect(panTo(z, -1000, f.W).tx).toBeCloseTo(-180);
  // Close enough in, the letters come.
  const near = [1.6, 1.6, 1.6].reduce((zz, by) => zoomBy(zz, by, f.W / 2, L, f.W), FIT);
  expect(letters(d, f, L, near).filter((l) => l.letter)).toHaveLength(24);
});

test("family words and symbols", () => {
  expect([familyWords("tWH"), familyWords("cSS"), familyWords("other")]).toEqual(["trans Watson–Crick / Hoogsteen", "cis Sugar / Sugar", "other"]);
  expect(glyphOf("nope", 0, 0)).toBeFalsy();
});
