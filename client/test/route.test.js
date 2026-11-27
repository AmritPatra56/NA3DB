import { test, expect } from "vitest";
import { routeOf, isRouted, redirectOf, railOf } from "../src/route.js";

test("pages match in any case, with one slash at the end or none", () => {
  expect(routeOf("/").name).toBe("landing");
  expect(routeOf("/SEARCH/").name).toBe("search");
  expect(routeOf("/report/").name).toBe("report");
  expect(routeOf("/Help/").name).toBe("unwritten");
  expect(routeOf("/structure/1ttt")).toEqual({ name: "structure", id: "1ttt" });
  expect(routeOf("/structure/1TTT/")).toEqual({ name: "structure", id: "1TTT" });
});

test("anything else is Page not found, loaded in full", () => {
  for (const p of ["/nope", "/structure", "/structure/1TTT/x", "/search/x"]) {
    expect(routeOf(p).name).toBe("missing");
    expect(isRouted(p)).toBe(false);
  }
});

test("old links are sent where the server sends them", () => {
  expect(redirectOf("/", "?q=1TTT")).toBe("/search?q=1TTT");
  expect(redirectOf("/", "")).toBe(null);
  expect(redirectOf("/report", "")).toBe("/search");
  expect(redirectOf("/report/", "?view=table")).toBe("/search");
  expect(redirectOf("/report", "?q=1TTT")).toBe(null);
  expect(redirectOf("/search", "?polymer_type=RNA")).toBe(null);
  expect(redirectOf("/search", "?polymer_type=Nucleic%20acid")).toBe("/search?polymer_type=DNA%2CRNA%2CDNA%2FRNA");
  expect(redirectOf("/search", "?polymer_type=RNA&polymer_type=Nucleic%20acid&page=2")).toBe("/search?polymer_type=RNA%2CDNA%2CDNA%2FRNA&page=2");
  expect(redirectOf("/search", "?q=x+y&polymer_type=Nucleic+acid")).toBe("/search?q=x%20y&polymer_type=DNA%2CRNA%2CDNA%2FRNA");
  expect(redirectOf("/search", "?polymer_type=Protein%2FNA,RNA&q=a%20b"))
    .toBe("/search?polymer_type=Protein%2FDNA%2CProtein%2FRNA%2CProtein%2FDNA%2FRNA%2CRNA&q=a%20b");
});

test("the rail: what is lit, whether Report shows, what the links carry", () => {
  expect(railOf({ name: "landing" }, "")).toEqual({ active: null, report: false, carry: "" });
  expect(railOf({ name: "search" }, "?q=a")).toEqual({ active: "search", report: true, carry: "?q=a" });
  expect(railOf({ name: "report" }, "?q=a")).toEqual({ active: "report", report: true, carry: "?q=a" });
  expect(railOf({ name: "structure", id: "1ttt" }, "?view=2d")).toEqual({ active: "search", report: true, carry: "?entry_id=1TTT" });
  for (const name of ["missing", "error", "unwritten"]) expect(railOf({ name }, "?q=a")).toEqual({ active: null, report: true, carry: "" });
});
