import { createMemoryRouter, RouterProvider } from "react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../src/App.jsx";
import { routes } from "../src/routes.jsx";
import { attachRouter } from "../src/address.js";
import replies from "./replies.json" with { type: "json" };
import fields from "./fields.json" with { type: "json" };

const ANSWERS = { ...replies, "/api/fields": fields };

class Watch {
  constructor(cb) { this.cb = cb; }
  observe(target) { this.cb([{ isIntersecting: true, target, contentRect: { width: 1000, height: 600 } }], this); }
  unobserve() {}
  disconnect() {}
}
function noScreen() {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
  window.IntersectionObserver = Watch;
  window.ResizeObserver = Watch;
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
}

export function renderAt(path) {
  noScreen();
  const asked = [];
  vi.stubGlobal("fetch", async (url) => {
    asked.push(url);
    const body = ANSWERS[url];
    return body === undefined
      ? new Response(JSON.stringify({ error: `Nothing at ${url}` }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  });
  const router = createMemoryRouter([{ element: <App />, children: routes }], { initialEntries: [path] });
  attachRouter(router);
  return { ...render(<RouterProvider router={router} />), router, asked };
}
