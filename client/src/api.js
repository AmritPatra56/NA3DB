// Reading the server's JSON. A reply that is not 200 is an error with the
// server's own words and its status, so a page can say what went wrong.
export async function getJSON(path, signal) {
  const res = await fetch(path, { signal });
  const body = await res.json().catch(() => null);
  // Aborted while the body was read: json() failed for that, not the reply.
  signal?.throwIfAborted();
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

// The heading and line error.ejs shows for a failed reply: a 404 names the
// address asked for, query and all (req.originalUrl); anything else is the
// server's own words.
export function failureOf(error, address) {
  return { heading: errorHeading(error), message: error.status === 404 ? `There is nothing at ${address}.` : error.message };
}
