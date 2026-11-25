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
//
// Besides this path's data or error, it gives last (the latest answer, data or
// error, whatever path) and good (the latest data, with its path), each with
// at: when it came. A page that shows whichever answered last compares them.
export function useApi(path, delay = 0, round = 0) {
  const [reply, setReply] = useState({ path: null, round, data: null, error: null, at: 0, good: null });

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getJSON(path, controller.signal)
        .then((data) => {
          const at = performance.now();
          setReply({ path, round, data, error: null, at, good: { path, data, at } });
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setReply((was) => ({ path, round, data: null, error, at: performance.now(), good: was.good }));
          }
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, delay, round]);

  // stale: the last path's data, for a page that keeps it on screen meanwhile.
  const answers = { last: reply, good: reply.good };
  if (path === null || reply.path !== path || reply.round !== round) {
    return { data: null, error: null, loading: path !== null, stale: reply.data, ...answers };
  }
  return { data: reply.data, error: reply.error, loading: false, ...answers };
}
