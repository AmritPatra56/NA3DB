import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { W, zoomed } from "../seqMap.js";

export function useMapZoom(scrollRef, n, onMoved) {
  const [w, setW] = useState(W);
  const asked = useRef({ w: W, left: null });

  const onZoom = useCallback((f, at) => {
    const el = scrollRef.current;
    const was = asked.current;
    const z = zoomed(was.w, f(was.w), was.left ?? el.scrollLeft, el.clientWidth, n, at);
    if (z.w === was.w) return;
    asked.current = z;
    setW(z.w);
  }, [scrollRef, n]);

  useLayoutEffect(() => {
    const z = asked.current;
    if (z.left === null) return;
    scrollRef.current.scrollLeft = z.left;
    asked.current = { w: z.w, left: null };
    onMoved(scrollRef.current.scrollLeft);
  }, [w, scrollRef, onMoved]);

  return { w, onZoom };
}
