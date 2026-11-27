import { test, expect } from "vitest";
import { countLabel } from "../src/countLabel.js";

test("the Search button says how many the panel would show", () => {
  expect(countLabel(null)).toBe("Search");
  expect(countLabel(0)).toBe("No results");
  expect(countLabel(1)).toBe("Show 1 result");
  expect(countLabel(2)).toBe("Show 2 results");
  expect(countLabel(1489)).toBe("Show 1,489 results");
});
