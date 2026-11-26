import { test, expect } from "vitest";
import { registry } from "./registry.js";
import { queryFromAddress, addressOf, entriesPath, countPath, boxSuggestPath, suggestionHref,
         filtersToParams, perPageFrom, panelOpenOf, askedValues, excludedOf, filtersOfPath } from "../src/searchQuery.js";

test("a plain address is the default search", () => {
  const q = queryFromAddress("", registry);
  expect([q.page, q.sort, q.perPage, q.match, q.view, q.panelOpen]).toEqual([1, "best", 20, "contains", "cards", true]);
  expect(addressOf(q, registry)).toBe("");
});

test("what the page has no control for falls back to the default", () => {
  const q = queryFromAddress("?page=-2&per_page=abc&match=nope&view=tiles", registry);
  expect([q.page, q.perPage, q.match, q.view]).toEqual([1, 20, "contains", "cards"]);
  // A sort the menu does not offer is sent as none, and read back the same.
  expect(queryFromAddress("?sort=nope", registry).sort).toBe("");
  expect(queryFromAddress("?view=arcs", registry).view).toBe("grid");
});

test("the page size: whole, at least 1, at most the cap", () => {
  expect(perPageFrom("50.7", registry)).toBe(50);
  expect(perPageFrom("0", registry)).toBe(20);
  expect(perPageFrom("9999", registry)).toBe(200);
  expect(perPageFrom(null, registry)).toBe(20);
});

test("an address reads back to itself, keeping not_ filters", () => {
  const search = "?q=tRNA&polymer_type=DNA%2CRNA&not_source_organism=Bacteria&page=3&sort=resolution_asc&panel=closed&view=lines&per_page=50&match=excludes";
  const q = queryFromAddress(search, registry);
  expect(q.filters.not_source_organism).toBe("Bacteria");
  expect(excludedOf(q.filters)).toEqual({ not_source_organism: "Bacteria" });
  expect(addressOf(q, registry)).toBe(search);
});

test("the requests: entries with page and size, count without them", () => {
  const q = queryFromAddress("?q=tRNA&page=2&sort=", registry);
  expect(entriesPath(q)).toBe("/api/entries?q=tRNA&page=2&per_page=20&match=contains");
  expect(countPath(q)).toBe("/api/count?q=tRNA&match=contains");
  expect(boxSuggestPath(queryFromAddress("?q=x&ligand=MG", registry), "ribo"))
    .toBe("/api/box_suggestions?ligand=MG&match=contains&q=ribo");
});

test("a close search under No entries found drops the page and writes spaces as %20", () => {
  const q = queryFromAddress("?q=ribozome&page=2", registry);
  expect(suggestionHref(q, registry, { field: "q", value: "ribosome 70S" })).toBe("/search?q=ribosome%2070S");
});

test("small readers", () => {
  expect(filtersToParams({ a: "", b: [], c: "x", d: ["1", "2"] }).toString()).toBe("c=x&d=1%2C2");
  expect(panelOpenOf("?panel=closed")).toBe(false);
  expect(panelOpenOf("?panel=open")).toBe(true);
  expect(askedValues("?a=1,2&b=3")).toEqual(["1", "2", "3"]);
  expect(filtersOfPath("/api/entries?ligand=MG&per_page=20", registry).ligand).toBe("MG");
});
