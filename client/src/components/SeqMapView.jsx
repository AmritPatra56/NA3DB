import { memo, useEffect, useMemo, useRef, useState } from "react";
import SeqMapDrawing from "./SeqMapDrawing.jsx";
import SeqMapInfo from "./SeqMapInfo.jsx";
import SeqMapKey from "./SeqMapKey.jsx";
import { W, LABEL_W, prepare, drawingOf, columnAt, centreOn } from "../seqMap.js";

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

// Memo: the overview redraws on every scroll, the map need not.
export default memo(SeqMapView);
