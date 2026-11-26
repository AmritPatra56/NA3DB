import { useEffect, useLayoutEffect, useState } from "react";

// The size of ref's element on screen, { width, height }: measured when
// `after` changes (what fills the box around it has come), and again whenever
// it changes (a turned phone, a resized window). null before the first.
export function useSize(ref, after) {
  const [size, setSize] = useState(null);
  const keep = (el) => {
    const { width, height } = el.getBoundingClientRect();
    setSize((was) => (was?.width === width && was?.height === height ? was : { width, height }));
  };

  useLayoutEffect(() => {
    keep(ref.current);
  }, [ref, after]);

  useEffect(() => {
    const observer = new ResizeObserver(([e]) => keep(e.target));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
