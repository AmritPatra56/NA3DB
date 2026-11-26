import { useEffect, useRef } from "react";
import ArcStage from "./ArcStage.jsx";
import ArcInfo from "./ArcInfo.jsx";
import ArcSummary from "./ArcSummary.jsx";
import ArcSide from "./ArcSide.jsx";
import { useApi } from "../hooks/useApi.js";
import { useSize } from "../hooks/useSize.js";
import { useArcView } from "../hooks/useArcView.js";

// The arc picture expanded in the page, right under it (arc_viewer.ejs and
// arc_viewer.js): every pair on screen, counts above the drawing, the pointed
// pair under it, the whole list by family beside it. It asks for the pairs as
// numbers (/arcs) only now, so a ribosome's thousands never weigh down the
// page. view: which picture (an assembly or "au"). Esc closes it, as Back does.
//
// ArcViewer      (owns what is shown: useArcView)
// ├─ ArcSummary, ArcStage, ArcInfo
// └─ ArcSide
function ArcViewer({ pdbId, view, onCollapse }) {
  const arcs = useApi(`/api/entries/${encodeURIComponent(pdbId)}/arcs?assembly=${encodeURIComponent(view)}`);
  const d = arcs.data;
  const box = useRef(null);
  const svgRef = useRef(null);
  const listRef = useRef(null);
  const size = useSize(svgRef, d);
  const v = useArcView(d, size);

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

  // A pair pointed at in the drawing: its row comes into the list's view.
  const onPointed = (i) => {
    v.onHover(i);
    if (i != null) listRef.current.querySelector(`tr[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const drawn = d?.pairs.length > 0;
  const note = arcs.error ? "Could not load the pairs." : !d ? "Loading…" : !drawn ? "No base pairs annotated for this entry." : null;

  return (
    <dialog ref={box} id="arc_viewer" className="arc_viewer in_place" aria-label="Arc picture, expanded" open>
      <div className="av_box">
        <div className="av_top">
          <strong className="av_id">{pdbId}</strong>
          <span className="av_title">{d?.title ?? ""}</span>
        </div>
        <div className="av_main">
          <div className="av_stage">
            <div className="av_summary">{drawn && <ArcSummary d={d} />}</div>
            <div className="av_zoom">
              <button type="button" className="av_in" aria-label="Zoom in" onClick={() => v.f && v.onZoom(1.6)}>＋</button>
              <button type="button" className="av_out" aria-label="Zoom out" onClick={() => v.f && v.onZoom(1 / 1.6)}>－</button>
              <button type="button" className="av_fit" onClick={() => v.f && v.onFit()}>Fit</button>
              <span>drag to move · wheel or buttons to zoom</span>
            </div>
            <ArcStage d={d} view={v} svgRef={svgRef} onPointed={onPointed} />
            <ArcInfo d={d} L={v.L} on={v.on} note={note} />
          </div>
          <ArcSide pdbId={pdbId} d={drawn ? d : null} L={v.L} on={v.on} fam={v.fam} listRef={listRef}
                   onHover={v.onHover} onPick={v.onPick} onFamily={v.onFamily} />
        </div>
      </div>
    </dialog>
  );
}

export default ArcViewer;
