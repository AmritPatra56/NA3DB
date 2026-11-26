// The only file that touches the browser's address and history. Since 8.1 it
// asks React Router, so a move between pages draws the new page in place
// instead of loading it again; pages still ask here where they are and tell it
// where to go, as before.
import { isRouted } from "./route.js";

// The router main.jsx made (createBrowserRouter), set before the first render.
let router = null;
export function attachRouter(made) {
  router = made;
}

// The address now: { path, search, hash }, search with its "?".
export function here() {
  const { pathname, search, hash } = router.state.location;
  return { path: pathname, search, hash };
}

// "#x" or "?a=b" alone: kept on this page and this search, as the browser
// reads a bare hash.
function full(url) {
  if (url.startsWith("#")) return here().path + here().search + url;
  if (url.startsWith("?")) return here().path + url;
  return url;
}

// To another page. One of ours is drawn in place (a router move); anything
// else (a download, another site) loads in full, as the EJS pages do.
export function go(href) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !isRouted(url.pathname)) {
    window.location.href = href;
    return;
  }
  router.navigate(url.pathname + url.search + url.hash);
}

// The same page at a new address, with a history entry so Back returns.
// Nothing happens when it is that address already. Returns whether it moved.
// The page stays where it is scrolled, as history.pushState leaves it.
export function pushAddress(url) {
  if (url === here().path + here().search) return false;
  router.navigate(full(url), { preventScrollReset: true });
  return true;
}

// The same page at a new address, without a history entry.
export function replaceAddress(url) {
  router.navigate(full(url), { replace: true, preventScrollReset: true });
}

// Back and Forward on this page: onMove() once each has landed. A move to
// another page is that page's to draw, so it is not passed on. Returns the
// function that stops it.
export function onHistory(onMove) {
  const path = here().path;
  let seen = router.state.location.key;
  return router.subscribe((state) => {
    if (state.location.key === seen) return;
    seen = state.location.key;
    if (state.historyAction === "POP" && state.location.pathname === path) onMove();
  });
}

// A panel opened in this page (the arc viewer, task 8.3.4): the same address
// as its own history entry, with mark as its state, so Back closes it, as
// expand.js does. The page reads the mark back from useLocation().state.
// A second panel replaces the first: the first's entry loses its mark, so
// Back from the second lands with none open, as expand.js does.
export async function pushMark(mark) {
  const { path, search, hash } = here();
  const url = path + search + hash;
  if (router.state.location.state) await router.navigate(url, { replace: true, state: null, preventScrollReset: true });
  router.navigate(url, { state: mark, preventScrollReset: true });
}

// Closes it: back to the entry under the mark.
export function back() {
  router.navigate(-1);
}
