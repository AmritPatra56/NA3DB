import { test, expect } from "vitest";
import { registry } from "./registry.js";
import { NOTHING, resultsOf, paintedOf, totalOf } from "../src/searchAnswer.js";

test("results: the answer, the last one while the next loads, none on error", () => {
  const page = { results: [1], total: 1 };
  expect(resultsOf({ data: page }, null)).toBe(page);
  expect(resultsOf({ data: null, stale: page }, null)).toBe(page);
  expect(resultsOf({ data: page }, new Error("x"))).toBe(NOTHING);
  expect(resultsOf({}, null)).toBe(NOTHING);
});

test("chips come from the last search answered", () => {
  expect(paintedOf({ good: null }, registry)).toEqual({});
  expect(paintedOf({ good: { path: "/api/entries?q=tRNA" } }, null)).toEqual({});
  expect(paintedOf({ good: { path: "/api/entries?q=tRNA&page=2" } }, registry).q).toBe("tRNA");
});

test("the Search button counts from whichever answered last", () => {
  const reply = { good: { at: 5, data: { total: 40 } } };
  expect(totalOf(reply, { last: { at: 3, data: { total: 7 } } }, true, 0)).toEqual({ value: 40, box: null });
  expect(totalOf(reply, { last: { at: 9, data: { total: 7 } } }, true, 0)).toEqual({ value: 7, box: { total: 7 } });
  expect(totalOf(reply, { last: { at: 9, data: { total: 7 } } }, false, 0).box).toBe(null);
  expect(totalOf(reply, { last: { at: 9, data: { total: 7 } } }, true, 9).box).toBe(null);
  expect(totalOf(reply, { last: { at: 9, data: null } }, true, 0)).toEqual({ value: null, box: null });
});
