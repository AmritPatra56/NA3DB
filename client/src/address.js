// Only this file touches the address and history.
import { isRouted } from "./route.js";

let router = null;
export function attachRouter(made) {
  router = made;
}

export function here() {
  const { pathname, search, hash } = router.state.location;
  return { path: pathname, search, hash };
}

function full(url) {
  if (url.startsWith("#")) return here().path + here().search + url;
  if (url.startsWith("?")) return here().path + url;
  return url;
}

export function go(href) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !isRouted(url.pathname)) {
    window.location.href = href;
    return;
  }
  router.navigate(url.pathname + url.search + url.hash);
}

export function pushAddress(url) {
  if (url === here().path + here().search) return false;
  router.navigate(full(url), { preventScrollReset: true });
  return true;
}

export function replaceAddress(url) {
  router.navigate(full(url), { replace: true, preventScrollReset: true });
}

export function onHistory(onMove) {
  const path = here().path;
  let seen = router.state.location.key;
  return router.subscribe((state) => {
    if (state.location.key === seen) return;
    seen = state.location.key;
    if (state.historyAction === "POP" && state.location.pathname === path) onMove();
  });
}

// A panel gets its own history entry, so Back closes it.
export async function pushMark(mark) {
  const { path, search, hash } = here();
  const url = path + search + hash;
  if (router.state.location.state) await router.navigate(url, { replace: true, state: null, preventScrollReset: true });
  router.navigate(url, { state: mark, preventScrollReset: true });
}

export function back() {
  router.navigate(-1);
}
