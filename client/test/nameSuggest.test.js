import { test, expect } from "vitest";
import { namesFor, stepped, drawn, closed, CLOSED } from "../src/nameSuggest.js";

// The panel's name lists (app.js draw/rank): best match first, server order within a rank.
const all = [
  { code: "10515", name: "Human adenovirus 2" },
  { code: "9606", name: "Homo sapiens, human" },
  { code: "10090", name: "Mus musculus, mouse" },
  { code: "MG", name: "MAGNESIUM ION" },
  { code: "MGX", name: null },
  ...Array.from({ length: 10 }, (_, i) => ({ code: "H" + i, name: "Hum thing " + i })),
];
const codes = (text) => namesFor(all, text).map((s) => s.code);

test("an exact name or code first, then codes that start so, then words", () => {
  expect(codes("human")).toEqual(["9606", "10515"]);
  expect(codes("mg")).toEqual(["MG", "MGX"]);
  expect(codes("mouse")).toEqual(["10090"]);
});

test("from three letters a match anywhere counts; below, only code starts", () => {
  expect(codes("musculus")).toEqual(["10090"]);
  expect(codes("hu")).toEqual([]);
  expect(codes("h")).toEqual(["H0", "H1", "H2", "H3", "H4", "H5", "H6", "H7"]);
});

test("an empty box shows the first eight, and never more than eight", () => {
  expect(codes("")).toHaveLength(8);
  expect(codes("hum")).toHaveLength(8);
});

test("the arrows go round and round; typing starts them again", () => {
  expect(stepped(CLOSED, "x", "ArrowDown", 3).active).toBe(0);
  // Up from the box is one short of the end, as app.js's (active + step + n) % n gives.
  expect(stepped(CLOSED, "x", "ArrowUp", 3).active).toBe(1);
  expect(stepped({ active: 0 }, "x", "ArrowUp", 3).active).toBe(2);
  expect(stepped({ active: 2 }, "x", "ArrowDown", 3).active).toBe(0);
  expect(drawn({ active: 2 }, "ab", true)).toEqual({ text: "ab", open: true, active: -1 });
  expect(drawn({ active: 2 }, "ab", false).active).toBe(2);
  expect(closed({ text: "ab", open: true, active: 1 })).toEqual({ text: "ab", open: false, active: -1 });
});
