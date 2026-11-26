import { test, expect } from "vitest";
import { pageNumbers } from "../src/pages.js";

// Values from app.js page_numbers on :4000.
test("up to 7 pages, every one is a button", () => {
  expect(pageNumbers(1, 0)).toEqual([]);
  expect(pageNumbers(1, 1)).toEqual([1]);
  expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("past 7, the first, the last, the page and its neighbours, a gap for each jump", () => {
  expect(pageNumbers(1, 20)).toEqual([1, 2, "...", 20]);
  expect(pageNumbers(3, 20)).toEqual([1, 2, 3, 4, "...", 20]);
  expect(pageNumbers(4, 20)).toEqual([1, "...", 3, 4, 5, "...", 20]);
  expect(pageNumbers(18, 20)).toEqual([1, "...", 17, 18, 19, 20]);
  expect(pageNumbers(20, 20)).toEqual([1, "...", 19, 20]);
});
