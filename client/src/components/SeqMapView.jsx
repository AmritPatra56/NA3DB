import { memo, useEffect, useMemo, useRef, useState } from "react";
import SeqMapDrawing from "./SeqMapDrawing.jsx";
import SeqMapInfo from "./SeqMapInfo.jsx";
import SeqMapKey from "./SeqMapKey.jsx";
import { W, LABEL_W, prepare, drawingOf, columnAt, centreOn } from "../seqMap.js";

// One map drawn at column width w, with the words and the key under it.
// Keyed by its strands, so a new set starts unpinned at its 5′ end, as
// seqmap.js draws it again. The column pointed at and the one kept by a click
// are this drawing's own, as the arc viewer's drag is; a new width clears
// the one pointed at, as a redraw does. Expanded, the full screen passes the
// scroll area's ref, onZoom for the wheel (useMapZoom) and onScroll.
// note: words for the info line until a column is shown (a failed ask).
function SeqMapView({ map, w = W, scrollRef, onZoom, onScroll, note }) {
  const [point, setPoint] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [drawnAt, setDrawnAt] = useState(w);
  if (drawnAt !== w) {
    setDrawnAt(w);
    setPoint(null);
  }
  const svg = useRef(null);
  const own = useRef(null);
  const scroll = scrollRef ?? own;

  // The wheel zooms around the pointer; sideways scrolling still scrolls.
  // Not passive, so the page does not scroll as well.
  useEffect(() => {
    if (!onZoom) return;
    const el = scroll.current;
    const wheel = (ev) => {
      if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      onZoom((was) => was * (ev.deltaY < 0 ? 1.25 : 0.8), ev.clientX - r.left - LABEL_W);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [scroll, onZoom]);
  const p = useMemo(() => prepare(map), [map]);
  const d = useMemo(() => drawingOf(map, p, w), [map, p, w]);
  const shown = pinned ?? point;
  const colAt = (ev) => columnAt(svg.current.getBoundingClientRect(), ev.clientX, w, p.n);

  // A partner named in the words: centred, and kept.
  function jump(i) {
    scroll.current.scrollLeft = centreOn(i, w, scroll.current.clientWidth);
    setPinned(i);
    setPoint(i);
  }

  return (
    <>
      <div ref={scroll} className="seqmap_scroll" tabIndex={0} aria-label="Sequence map, scrolls sideways" onScroll={onScroll}>
        <SeqMapDrawing map={map} p={p} d={d} w={w} shown={shown} pinned={pinned} svgRef={svg}
                       onPointerMove={(ev) => { if (pinned === null && ev.pointerType === "mouse") setPoint(colAt(ev)); }}
                       onPointerLeave={() => { if (pinned === null) setPoint(null); }}
                       onClick={(ev) => { const i = colAt(ev); setPinned(pinned === i ? null : i); setPoint(i); }} />
      </div>
      <SeqMapInfo map={map} p={p} shown={shown} note={note} onJump={jump} />
      <SeqMapKey map={map} />
    </>
  );
}

// Memo: the full screen redraws its overview on every scroll; the map, drawn
// again only when its props change, need not.
export default memo(SeqMapView);
