// Reading the server's JSON. A reply that is not 200 is an error with the
// server's own words and its status, so a page can say what went wrong.
export async function getJSON(path, signal) {
  const res = await fetch(path, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.error ?? `${res.status} from ${path}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

// The heading error.ejs gives each kind of failure (server.js).
export function errorHeading(error) {
  if (error.status === 404) return "Page not found";
  if (error.status === 503) return "Temporarily unavailable";
  return "Something went wrong";
}
