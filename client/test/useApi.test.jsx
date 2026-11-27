// @vitest-environment jsdom
import { test, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApi } from "../src/hooks/useApi.js";
import { getJSON } from "../src/api.js";

vi.mock("../src/api.js", () => ({ getJSON: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(getJSON).mockReset();
});

function held() {
  const asked = [];
  vi.mocked(getJSON).mockImplementation((path, signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    asked.push({ path, resolve });
  }));
  return asked;
}

test("typing makes one request per pause, not one per letter", () => {
  vi.useFakeTimers();
  const asked = held();
  const { rerender } = renderHook(({ path }) => useApi(path, 300), { initialProps: { path: "/api/count?q=t" } });
  for (const q of ["tR", "tRN", "tRNA"]) rerender({ path: `/api/count?q=${q}` });
  act(() => vi.advanceTimersByTime(300));
  expect(asked.map((a) => a.path)).toEqual(["/api/count?q=tRNA"]);
});

test("a reply that arrives late is thrown away", async () => {
  vi.useFakeTimers();
  const asked = held();
  const { result, rerender } = renderHook(({ path }) => useApi(path), { initialProps: { path: "/api/count?q=tRNA" } });
  act(() => vi.advanceTimersByTime(0));
  rerender({ path: "/api/count?q=tRNAxyz" });
  act(() => vi.advanceTimersByTime(0));
  await act(async () => asked[1].resolve({ total: 0 }));
  await act(async () => asked[0].resolve({ total: 163 }));
  expect(result.current.data).toEqual({ total: 0 });
});

test("no path asks nothing and shows nothing", () => {
  const asked = held();
  const { result } = renderHook(() => useApi(null));
  expect(asked).toEqual([]);
  expect(result.current).toMatchObject({ data: null, loading: false });
});
