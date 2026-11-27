import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../api.js";

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
