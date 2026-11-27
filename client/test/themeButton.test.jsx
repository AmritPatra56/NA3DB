// @vitest-environment jsdom
import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import ThemeButton from "../src/components/ThemeButton.jsx";

// The rail's theme button (theme.test.js before 8.17, against public/theme.js).
const KEY = "na3db-theme";
const root = document.documentElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete root.dataset.theme;
});

function mount(saved) {
  if (saved) localStorage.setItem(KEY, saved);
  return render(<ThemeButton />).container.querySelector("button.rail-theme");
}

test("starts on Auto, leaving the theme to the device", () => {
  const button = mount();
  expect(button.dataset.choice).toBe("auto");
  expect(root.dataset.theme).toBeUndefined();
  expect(button.getAttribute("aria-label")).toBe("Theme: auto, follows your device. Switch to light.");
});

test("a click goes Auto, Light, Dark, Auto, and is remembered", () => {
  const button = mount();
  fireEvent.click(button);
  expect([root.dataset.theme, localStorage.getItem(KEY)]).toEqual(["light", "light"]);
  fireEvent.click(button);
  expect([root.dataset.theme, localStorage.getItem(KEY)]).toEqual(["dark", "dark"]);
  fireEvent.click(button);
  expect(root.dataset.theme).toBeUndefined();
  expect(localStorage.getItem(KEY)).toBeNull();
});

test("a remembered choice comes back; a junk one is Auto", () => {
  expect(mount("dark").dataset.choice).toBe("dark");
  expect(root.dataset.theme).toBe("dark");
  cleanup();
  delete root.dataset.theme;
  expect(mount("purple").dataset.choice).toBe("auto");
  expect(root.dataset.theme).toBeUndefined();
});

test("blocked storage still lets the button switch the page", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  fireEvent.click(mount());
  expect(root.dataset.theme).toBe("light");
});

test("a change in another tab is followed", () => {
  const button = mount();
  localStorage.setItem(KEY, "dark");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: KEY })));
  expect(button.dataset.choice).toBe("dark");
  expect(root.dataset.theme).toBe("dark");
});
