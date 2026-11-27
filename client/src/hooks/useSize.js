import { useEffect, useLayoutEffect, useState } from "react";

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

export function useClientWidth(ref, after) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(ref.current.clientWidth);
  }, [ref, after]);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) => setWidth(e.target.clientWidth));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, after]);
  return width;
}
