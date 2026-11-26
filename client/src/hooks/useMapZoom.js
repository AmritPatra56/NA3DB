import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { W, zoomed } from "../seqMap.js";

// The expanded map's column width (seqmap.js zoom_to) over n columns in the
// scroll area scrollRef: a new width keeps the column under the pointer (or
// in the middle) where it was. The width and scroll asked last are kept in
// a ref too, so two wheel steps before a paint build on each other.
// onZoom(f, at): f gives the new width from the old one. onMoved(left) hears
// the scroll at once, as zoom_to calls frame, not on the scroll event.
export function useMapZoom(scrollRef, n, onMoved) {
  const [w, setW] = useState(W);
  const asked = useRef({ w: W, left: null });

  // Kept the same between draws, so the map's wheel listener stays put.
  const onZoom = useCallback((f, at) => {
    const el = scrollRef.current;
    const was = asked.current;
    const z = zoomed(was.w, f(was.w), was.left ?? el.scrollLeft, el.clientWidth, n, at);
    // At a limit already: nothing is drawn again, nothing moves.
    if (z.w === was.w) return;
    asked.current = z;
    setW(z.w);
  }, [scrollRef, n]);

  // Drawn at the new width: the scroll that keeps the column put.
  useLayoutEffect(() => {
    const z = asked.current;
    if (z.left === null) return;
    scrollRef.current.scrollLeft = z.left;
    asked.current = { w: z.w, left: null };
    onMoved(scrollRef.current.scrollLeft);
  }, [w, scrollRef, onMoved]);

  return { w, onZoom };
}
