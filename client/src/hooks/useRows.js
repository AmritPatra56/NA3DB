import { useEffect, useRef, useState } from "react";
import { getJSON } from "../api.js";

// Each report table's rows, kept while switching tabs (report.js rows,
// totals, asking). A table is fetched the first time it opens and again when
// its request changes (an option ticked); a slow answer for a tab already
// left is kept for when it opens. Only the latest request of a table counts.
export function useRows(key, path) {
  const [got, setGot] = useState({});
  const asking = useRef({});

  useEffect(() => {
    if (asking.current[key] === path) return;
    asking.current[key] = path;
    const keep = (answer) => {
      if (asking.current[key] === path) setGot((was) => ({ ...was, [key]: { path, ...answer } }));
    };
    getJSON(path).then((data) => keep({ data }), (error) => keep({ error }));
  }, [key, path]);

  const mine = got[key]?.path === path ? got[key] : null;
  return { data: mine?.data ?? null, error: mine?.error ?? null, loading: !mine };
}
