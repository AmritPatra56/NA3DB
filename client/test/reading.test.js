// @vitest-environment jsdom
import { test, expect, vi, afterEach } from "vitest";
import { scrollToSection } from "../src/reading.js";

afterEach(() => { document.body.innerHTML = ""; });

test("a section named in the address is scrolled to", () => {
  document.body.innerHTML = '<section id="base-pairs"></section>';
  const el = document.getElementById("base-pairs");
  el.scrollIntoView = vi.fn();
  expect(scrollToSection("#base-pairs")).toBe(true);
  expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

test("no hash or an unknown one does nothing", () => {
  expect(scrollToSection("")).toBe(false);
  expect(scrollToSection("#")).toBe(false);
  expect(scrollToSection("#nowhere")).toBe(false);
});
