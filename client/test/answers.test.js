import { test, expect } from "vitest";
import { answerRow, toggleTick, picksOf } from "../src/answers.js";

const browse = [{ rows: [
  { label: "Modified", url: "/search?modification=yes", no_url: "/search?modification=no", say_no: "No modified",
    options: [{ label: "PSU", url: "/search?nonstandard_residue=PSU" }, { label: "5MC", url: "/search?nonstandard_residue=5MC", say: "5-methyl C" }] },
  { label: "Ligand", url: "/search?has_ligand=yes", no_url: "/search?has_ligand=no", say_yes: "Has a ligand", options: [] },
] }];

test("pressing the answer on turns the row off; leaving Yes drops its ticks", () => {
  let a = answerRow({}, "Modified", "yes");
  expect(a).toEqual({ Modified: { answer: "yes", ticked: [] } });
  a = toggleTick(a, "Modified", "PSU");
  expect(answerRow(a, "Modified", "no")).toEqual({ Modified: { answer: "no", ticked: [] } });
  expect(answerRow(a, "Modified", "yes")).toEqual({});
});

test("ticking and unticking keeps the rest", () => {
  let a = toggleTick({}, "Modified", "PSU");
  a = toggleTick(a, "Modified", "5MC");
  expect(a.Modified.ticked).toEqual(["PSU", "5MC"]);
  expect(toggleTick(a, "Modified", "PSU").Modified.ticked).toEqual(["5MC"]);
});

test("picks come in page order; ticks ask their options, in row order", () => {
  expect(picksOf(browse, {})).toEqual([]);
  expect(picksOf(browse, { Ligand: { answer: "yes", ticked: [] }, Modified: { answer: "no", ticked: [] } })).toEqual([
    { key: "modification", values: ["no"], label: "No modified" },
    { key: "has_ligand", values: ["yes"], label: "Has a ligand" },
  ]);
  expect(picksOf(browse, { Modified: { answer: "yes", ticked: ["5MC", "PSU"] } })).toEqual([
    { key: "nonstandard_residue", values: ["PSU"], label: "PSU" },
    { key: "nonstandard_residue", values: ["5MC"], label: "5-methyl C" },
  ]);
  expect(picksOf(browse, { Modified: { answer: "yes", ticked: [] } })).toEqual([{ key: "modification", values: ["yes"], label: "Modified" }]);
});
