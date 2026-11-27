export async function getJSON(path, signal) {
  const res = await fetch(path, { signal });
  const body = await res.json().catch(() => null);
  // Aborted while the body was read.
  signal?.throwIfAborted();
  if (!res.ok) {
    const error = new Error(body?.error ?? `${res.status} from ${path}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

export function errorHeading(error) {
  if (error.status === 404) return "Page not found";
  if (error.status === 503) return "Temporarily unavailable";
  return "Something went wrong";
}

export function failureOf(error, address) {
  return { heading: errorHeading(error), message: error.status === 404 ? `There is nothing at ${address}.` : error.message };
}
