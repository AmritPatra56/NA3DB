// Draws the whole app (rail, page, footer) at an address in jsdom, as
// main.jsx does in the browser, with fetch answered from replies.json: the
// replies :4000 gave for these pages. A path not in it is a 404.
// Refresh replies.json the way its paths were recorded: fetch each key from
// :4000 and save the bodies, keyed by path.
import { createMemoryRouter, RouterProvider } from "react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../src/App.jsx";
import { routes } from "../src/routes.jsx";
import { attachRouter } from "../src/address.js";
import replies from "./replies.json" with { type: "json" };
import fields from "./fields.json" with { type: "json" };

const ANSWERS = { ...replies, "/api/fields": fields };

// What jsdom lacks and the pages ask for: no screen, so nothing is narrow and
// everything is in view at once.
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
