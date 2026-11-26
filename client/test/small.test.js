import { test, expect } from "vitest";
import { number, structures, listJoin, counted } from "../src/format.js";
import { searchable, suggestable } from "../src/query.js";
import { errorHeading, failureOf } from "../src/api.js";
import { nextTile, viewForSection } from "../src/views.js";
import { noteParts } from "../src/searchNote.js";

test("numbers as the old pages write them", () => {
  expect(number(1234567)).toBe("1,234,567");
  expect([structures(1), structures(2), structures(12000)]).toEqual(["1 structure", "2 structures", "12,000 structures"]);
  expect([0, 1, 2].map((i) => listJoin(i, 3))).toEqual(["", ", ", " or "]);
  expect([counted(1, "pair", "pairs"), counted(1500, "pair", "pairs")]).toEqual(["1 pair", "1,500 pairs"]);
});

test("the box searches from two letters and suggests without quotes", () => {
  expect([searchable("a"), searchable("ab")]).toEqual([false, true]);
  expect([suggestable("ab"), suggestable('"ab')]).toEqual([true, false]);
});

test("error pages say what error.ejs says", () => {
  expect([404, 503, 500].map((status) => errorHeading({ status })))
    .toEqual(["Page not found", "Temporarily unavailable", "Something went wrong"]);
  expect(failureOf({ status: 404, message: "x" }, "/structure/ZZZZ?view=2d"))
    .toEqual({ heading: "Page not found", message: "There is nothing at /structure/ZZZZ?view=2d." });
  expect(failureOf({ status: 500, message: "Database down" }, "/x").message).toBe("Database down");
});

test("arrow keys move round the tiles; sections name their view", () => {
  expect(["ArrowRight", "ArrowLeft", "Home", "End", "a"].map((k) => nextTile(k, 2))).toEqual([0, 1, 0, 2, null]);
  expect(nextTile("ArrowLeft", 0)).toBe(2);
  expect(["base-pairs", "sequence-map", "conformation", "overview"].map(viewForSection)).toEqual(["1d", "1d", "3d", null]);
});

test("the search note's lines", () => {
  expect(noteParts({ exact: true, phrase: '"a b"', total: 3 })).toEqual([{ exact: true }]);
  expect(noteParts({ phrase: '"a b"', total: 3 })).toEqual([{ phrase: '"a b"' }]);
  expect(noteParts({ phrase: '"a b"', total: 0 })).toEqual([]);
  expect(noteParts({ stored_as: ["Smith, J.", "Smith, J.A."] })).toEqual([{ storedAs: "Smith, J., Smith, J.A." }]);
});
