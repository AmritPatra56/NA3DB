import { useEffect, useState } from "react";

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
