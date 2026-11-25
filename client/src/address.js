// The only file that touches the browser's address and history. Pages ask it
// where they are and tell it where to go, so React Router (8.1) replaces this
// one file instead of every component.

// The address now: { path, search, hash }, search with its "?".
export const here = () => ({ path: window.location.pathname, search: window.location.search, hash: window.location.hash });

// To another page (a link followed in full, as the EJS pages do).
export function go(href) {
  window.location.href = href;
}

// The same page at a new address, with a history entry so Back returns.
// Nothing happens when it is that address already. Returns whether it moved.
export function pushAddress(url) {
  if (url === window.location.pathname + window.location.search) return false;
  window.history.pushState(null, "", url);
  return true;
}

// The same page at a new address, without a history entry.
export function replaceAddress(url) {
  window.history.replaceState(window.history.state, "", url);
}

// Back and Forward: onMove() after each. Returns the function that stops it.
export function onHistory(onMove) {
  window.addEventListener("popstate", onMove);
  return () => window.removeEventListener("popstate", onMove);
}
