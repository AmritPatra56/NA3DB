import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

// flushSync: open the section before the browser jumps to the #link.
export function useFolds() {
  const [folded, setFolded] = useState(() => new Set());

  useEffect(() => {
    const click = (e) => {
      const link = e.target.closest('a[href^="#"]');
      const id = link && document.getElementById(link.getAttribute("href").slice(1))?.closest(".page_section")?.id;
      if (id) flushSync(() => setFolded((was) => (was.has(id) ? new Set([...was].filter((x) => x !== id)) : was)));
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);

  const onFold = (id) => setFolded((was) => (was.has(id) ? new Set([...was].filter((x) => x !== id)) : new Set([...was, id])));
  return { folded, onFold };
}
