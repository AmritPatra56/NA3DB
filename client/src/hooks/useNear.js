import { useEffect, useState } from "react";

// Whether the element in ref has come within margin of the screen; once
// true it stays true. So a ribosome's map costs nothing to a reader who
// never scrolls there (seqmap.js).
export function useNear(ref, margin = "600px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: margin });
    seen.observe(ref.current);
    return () => seen.disconnect();
  }, [ref, margin, near]);
  return near;
}
