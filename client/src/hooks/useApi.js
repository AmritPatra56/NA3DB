import { useEffect, useState } from "react";
import { getJSON } from "../api.js";

// A newer path aborts the older request, and a reply is shown only for its own path.
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

  const answers = { last: reply, good: reply.good };
  if (path === null || reply.path !== path || reply.round !== round) {
    return { data: null, error: null, loading: path !== null, stale: reply.data, ...answers };
  }
  return { data: reply.data, error: reply.error, loading: false, ...answers };
}
