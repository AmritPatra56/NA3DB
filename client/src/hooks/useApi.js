import { useEffect, useState } from "react";
import { getJSON } from "../api.js";

// One GET from /api, kept in state: the Joker's useEffect + fetch, written
// once so no component repeats it.
//
// path null: nothing is asked. delay: wait this long after the path last
// changed, so typing sends one request per pause, not one per key.
// round: a new number asks the same path again (Search pressed twice).
// A newer path aborts the older request (cleanup), and a reply is only shown
// for the path it was asked for, so a slow old answer never shows (6.6).
export function useApi(path, delay = 0, round = 0) {
  const [reply, setReply] = useState({ path: null, round, data: null, error: null });

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getJSON(path, controller.signal)
        .then((data) => setReply({ path, round, data, error: null }))
        .catch((error) => {
          if (!controller.signal.aborted) setReply({ path, round, data: null, error });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, delay, round]);

  // stale: the last path's data, for a page that keeps it on screen meanwhile.
  if (path === null || reply.path !== path || reply.round !== round) return { data: null, error: null, loading: path !== null, stale: reply.data };
  return { data: reply.data, error: reply.error, loading: false };
}
