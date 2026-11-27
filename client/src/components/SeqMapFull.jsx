import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SeqMapView from "./SeqMapView.jsx";
import SeqMapSide from "./SeqMapSide.jsx";
import SeqMapOverview from "./SeqMapOverview.jsx";
import { useFullMap } from "../hooks/useFullMap.js";
import { useMapZoom } from "../hooks/useMapZoom.js";
import { useClientWidth } from "../hooks/useSize.js";
import { W, fileUrl, fitWidth, prepare, viewBox, centreOn } from "../seqMap.js";

// The sequence map expanded in the page, right under it (seqmap.js
// open_full): every strand can go on the ruler, an overview shows where the
// view is, and the columns zoom from letters down to a fraction of a pixel.
// first: the section's map, which it opens on. Esc closes it, as Back does.
//
// SeqMapFull     (owns the strands: useFullMap, and the zoom: useMapZoom)
// ├─ SeqMapSide
// ├─ SeqMapOverview
// └─ SeqMapView
function SeqMapFull({ first, onCollapse }) {
  const box = useRef(null);
  const scroll = useRef(null);
  const full = useFullMap(first);
  const { map } = full;
  const p = useMemo(() => prepare(map), [map]);
  const drawnAt = full.drawn;
  const [left, setLeft] = useState({ drawn: drawnAt, at: 0 });
  // The same functions between draws, so scrolling never draws the map again.
  const onMoved = useCallback((x) => setLeft({ drawn: drawnAt, at: x }), [drawnAt]);
  const onScroll = useCallback((ev) => onMoved(ev.currentTarget.scrollLeft), [onMoved]);
  const { w, onZoom } = useMapZoom(scroll, p.n, onMoved);
  // A new set starts at its 5′ end.
  const at = left.drawn === drawnAt ? left.at : 0;
  const view = useClientWidth(scroll, drawnAt);
  const frame = viewBox(at, view, w, p.n);

  // show(), as expand.js does: the browser then focuses the first control inside.
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

  const zoomTo = (z) => onZoom((was) => (z === "fit" ? fitWidth(scroll.current.clientWidth, p.n) : z === "read" ? W : was * (z === "in" ? 1.6 : 1 / 1.6)));
  const scrollTo = (x) => { scroll.current.scrollLeft = x; };

  return (
    <dialog ref={box} className="arc_viewer seqmap_dialog in_place" aria-label="Sequence map, expanded">
      <div className="av_box">
        <div className="av_top">
          <strong className="smd_id">{map.pdb_id}</strong>
          <span className="av_title">Sequence map · {map.names.join(" & ")}</span>
          <span className="smd_zoom">
            <button type="button" data-zoom="in" aria-label="Zoom in" onClick={() => zoomTo("in")}>＋</button>
            <button type="button" data-zoom="out" aria-label="Zoom out" onClick={() => zoomTo("out")}>－</button>
            <button type="button" data-zoom="fit" title="Every column on screen" onClick={() => zoomTo("fit")}>Fit</button>
            <button type="button" data-zoom="read" title="Columns wide enough to read" onClick={() => zoomTo("read")}>Letters</button>
          </span>
          <a className="download download_small smd_file" download href={fileUrl(map)}>Download notation</a>
        </div>
        <div className="smd_main">
          <SeqMapSide map={map} ticked={full.ticked} onStrands={full.onStrands} onGo={(n) => scrollTo(p.starts[n] * w)} />
          <div className="smd_stage">
            <SeqMapOverview key={drawnAt} map={map} p={p} frame={frame} onCentre={(i) => scrollTo(centreOn(i, w, scroll.current.clientWidth))} />
            <div className="seqmap smd_map">
              <SeqMapView key={drawnAt} map={map} w={w} scrollRef={scroll} onZoom={onZoom}
                          note={full.failed ? "Those strands could not be drawn; try again." : null}
                          onScroll={onScroll} />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export default SeqMapFull;
