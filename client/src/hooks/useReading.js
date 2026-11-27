import { useEffect, useState } from "react";
import { viewForSection } from "../views.js";
import { sectionBeingRead, hasScrolled, scrollToSection } from "../reading.js";
import { replaceAddress, here } from "../address.js";

export function useReading() {
  const [reading, setReading] = useState(null);
  const [view, setView] = useState(null);

  useEffect(() => {
    let current = null;
    let frame = 0;
    function follow() {
      frame = 0;
      const here = sectionBeingRead();
      if (here === null || here === current) return;
      current = here;
      setReading(here);
      const asked = viewForSection(here);
      if (asked !== null) setView(asked);
      if (hasScrolled()) replaceAddress("#" + here);
    }
    const soon = () => { if (!frame) frame = requestAnimationFrame(follow); };
    document.addEventListener("scroll", soon, { capture: true, passive: true });
    addEventListener("resize", follow);
    scrollToSection(here().hash);
    soon();
    return () => {
      document.removeEventListener("scroll", soon, { capture: true });
      removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { reading, view };
}
