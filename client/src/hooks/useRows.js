import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../api.js";

// Each report table's rows, kept while switching tabs (report.js rows,
// totals, asking). The open table is fetched the first time it opens and
// again when its request changes (an option ticked); a slow answer for a tab
// already left is kept for when it opens. Only the latest request of a table
// counts. load(k, p) gives table k's reply for request p, fetching it only if
// it is not here or on its way (Download all); a failed one is asked again.
export function useRows(key, path) {
  const [got, setGot] = useState({});
  const asking = useRef({});

  const load = useCallback((k, p) => {
    if (asking.current[k]?.path === p) return asking.current[k].promise;
    const latest = () => asking.current[k]?.path === p;
    const promise = getJSON(p).then((data) => {
      if (latest()) setGot((was) => ({ ...was, [k]: { path: p, data } }));
      return data;
    }, (error) => {
      if (latest()) {
        delete asking.current[k];
        setGot((was) => ({ ...was, [k]: { path: p, error } }));
      }
      throw error;
    });
    asking.current[k] = { path: p, promise };
    // Loading again: what was shown for this table goes (load_table).
    setGot((was) => {
      if (!(k in was)) return was;
      const rest = { ...was };
      delete rest[k];
      return rest;
    });
    return promise;
  }, []);

  useEffect(() => {
    load(key, path).catch(() => {});
  }, [key, path, load]);

  const mine = got[key]?.path === path ? got[key] : null;
  return { data: mine?.data ?? null, error: mine?.error ?? null, loading: !mine, load };
}
