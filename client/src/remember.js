// A choice kept for the next page (localStorage), as structure.ejs keeps the
// nav fold and the Views width and the rail keeps the theme. Storage can be
// blocked; then nothing is kept and the choice holds for this page only.
export function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const remembered = (key, value) => recall(key) === value;

export function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export function forget(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}
