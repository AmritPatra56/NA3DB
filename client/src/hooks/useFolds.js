import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

// Which sections are folded (structure.ejs fold). A click on a #link whose
// target sits in a folded section opens it first, or the link would land on
// nothing. flushSync: open it before the browser jumps, not after.
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
