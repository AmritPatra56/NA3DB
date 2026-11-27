// @vitest-environment jsdom
import { test, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LandingCount from "../src/components/LandingCount.jsx";

afterEach(cleanup);

const line = (result) => {
  const { container } = render(<MemoryRouter><LandingCount result={result} /></MemoryRouter>);
  const p = container.querySelector("p.landing_count");
  return { text: p.textContent, links: [...p.querySelectorAll("a")].map((a) => a.getAttribute("href")) };
};

test("the count is written in words a person reads; no reply yet, an empty line", () => {
  const said = [null, { total: 0 }, { total: 1 }, { total: 163 }, { total: 1489 }].map((r) => {
    const t = line(r).text;
    cleanup();
    return t;
  });
  expect(said).toEqual(["", "no structures match", "1 structure", "163 structures", "1,489 structures"]);
});

test("no match offers close searches as links with their counts", () => {
  const got = line({ total: 0, suggestions: [{ field: "q", value: "ribosome", total: 133 },
                                             { field: "q", value: "ribozyme", total: 20 }] });
  expect(got.text).toBe("no structures match. Did you mean ribosome (133) or ribozyme (20)?");
  expect(got.links).toEqual(["/search?q=ribosome", "/search?q=ribozyme"]);
});
