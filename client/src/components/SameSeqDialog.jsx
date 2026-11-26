import { useEffect, useRef } from "react";

// The comparison expanded in the page, right under its group (sameseq.js
// open_full, expand.js): wide, scrolled into sight; Esc closes it, as Back does.
function SameSeqDialog({ onCollapse, children }) {
  const box = useRef(null);

  useEffect(() => {
    box.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const key = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      onCollapse();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onCollapse]);

  return (
    <dialog ref={box} className="arc_viewer ss_dialog in_place" aria-label="Compare two chains, expanded" open>
      <div className="av_box">
        <div className="av_top">
          <strong>Compare</strong>
          <span className="av_title">Same sequence, two chains</span>
        </div>
        <div className="ss_dialog_body">{children}</div>
      </div>
    </dialog>
  );
}

export default SameSeqDialog;
