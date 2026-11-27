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
