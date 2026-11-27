import { useEffect, useRef } from "react";

function SameSeqDialog({ onCollapse, children }) {
  const box = useRef(null);

  useEffect(() => {
    box.current.show();
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
    <dialog ref={box} className="arc_viewer ss_dialog in_place" aria-label="Compare two chains, expanded">
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
