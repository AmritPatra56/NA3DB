import { test, expect } from "vitest";
import { marked, nextActive, optionId } from "../src/suggest.js";

// box_suggest.js: the bold part, and the arrows (past either end is the box).
test("the typed text is marked where it starts a word", () => {
  expect(marked("Homo sapiens", "sap")).toEqual(["Homo ", "sap", "iens"]);
  expect(marked("Homo sapiens", "omo")).toEqual(["Homo sapiens"]);
  expect(marked("tRNA-Phe", "phe")).toEqual(["tRNA-", "Phe", ""]);
  expect(marked("ab ab", "b")).toEqual(["ab ab"]);
});

test("the arrows walk the list and fall back into the box", () => {
  expect(nextActive("ArrowDown", -1, 3)).toBe(0);
  expect(nextActive("ArrowUp", -1, 3)).toBe(2);
  expect(nextActive("ArrowDown", 2, 3)).toBe(-1);
  expect(nextActive("ArrowUp", 0, 3)).toBe(-1);
  expect(optionId(2)).toBe("q_box_options_2");
});
