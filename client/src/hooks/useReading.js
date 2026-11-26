import { useEffect, useState } from "react";
import { viewForSection } from "../views.js";
import { sectionBeingRead, hasScrolled } from "../reading.js";
import { replaceAddress } from "../address.js";

// The structure page follows the reading position (structure.ejs): at most
// once a frame while scrolling, and on resize. reading: the section being
// read, for the nav. view: the last view a section asked for, which Views
// follows until the reader picks one. The address gets the section's #id once
// the page has moved. Listeners go in cleanup.
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
    soon();
    return () => {
      document.removeEventListener("scroll", soon, { capture: true });
      removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { reading, view };
}
