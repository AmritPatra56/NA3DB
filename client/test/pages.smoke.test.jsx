// @vitest-environment jsdom
import { test, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { renderAt } from "./render.jsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rail = () => [...document.querySelectorAll(".rail a.rail-item")]
  .map((a) => a.getAttribute("href") + (a.classList.contains("active") ? "*" : ""));
const headings = (level) => screen.queryAllByRole("heading", { level }).map((h) => h.textContent.trim());

test("landing: the five questions and the count", async () => {
  renderAt("/");
  await waitFor(() => expect(document.querySelector(".landing_stats")?.textContent.replace(/\s+/g, " ").trim()).toBe("1,489 structures · updated 6 Nov 2026"));
  expect(headings(2)).toEqual(["What is it made of?", "Where is it from?", "How was it solved?", "Is it modified?", "What is bound to it?"]);
  expect(document.title).toBe("NA3DB");
  expect(rail()).toEqual(["/search", "#"]);
});

test("search: one result for 1TTT, the rail carrying the search", async () => {
  renderAt("/search?entry_id=1TTT");
  await screen.findByRole("link", { name: "1TTT" });
  await waitFor(() => expect(headings(1)).toEqual(["Full search", "Entries (1)"]));
  expect(document.title).toBe("NA3DB · Full search");
  expect(rail()).toEqual(["/search?entry_id=1TTT*", "#", "/report?entry_id=1TTT"]);
});

test("structure: every section of 4OPJ, in page order", async () => {
  renderAt("/structure/4OPJ");
  await waitFor(() => expect(headings(2)).toHaveLength(12));
  expect(headings(2)).toEqual(["Views", "Overview", "Molecules", "Sources", "Modified nucleotides", "Ligands",
    "Base pairs", "Conformation", "Sequence map", "Same sequence", "Citation", "Links and downloads"]);
  expect(headings(1)).toEqual(["4OPJ"]);
  expect(document.title).toBe("NA3DB · 4OPJ");
  expect(rail()).toEqual(["/search?entry_id=4OPJ*", "#", "/report?entry_id=4OPJ"]);
});

test("report: the structures table for 1TTT", async () => {
  renderAt("/report?entry_id=1TTT");
  await screen.findByText(/Structures \(1\)/);
  expect(headings(1)).toEqual(["Report", "Structures (1)"]);
  expect(document.title).toBe("NA3DB report");
  expect(rail()).toEqual(["/search?entry_id=1TTT", "#", "/report?entry_id=1TTT*"]);
});

test("an address with no page, and a footer page", async () => {
  const { router } = renderAt("/nope?x=1");
  expect(headings(1)).toEqual(["Page not found"]);
  expect(screen.getByText("There is nothing at /nope?x=1.")).toBeTruthy();
  expect(document.title).toBe("NA3DB · Page not found");
  expect(rail()).toEqual(["/search", "#", "/report"]);
  await router.navigate("/cite");
  await screen.findByRole("heading", { level: 1, name: "How to cite" });
  expect(document.title).toBe("NA3DB · How to cite");
});

test("old links go where the server sends them", async () => {
  const { router } = renderAt("/report");
  await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
  await screen.findByRole("heading", { level: 1, name: "Full search" });
});

test("a failed reply shows the server's error page and lights nothing", async () => {
  renderAt("/structure/ZZZZ");
  await screen.findByRole("heading", { level: 1, name: "Page not found" });
  expect(screen.getByText("There is nothing at /structure/ZZZZ.")).toBeTruthy();
  await waitFor(() => expect(rail()).toEqual(["/search", "#", "/report"]));
});
