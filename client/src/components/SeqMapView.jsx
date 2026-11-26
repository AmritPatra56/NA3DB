import { useMemo, useRef, useState } from "react";
import SeqMapDrawing from "./SeqMapDrawing.jsx";
import SeqMapInfo from "./SeqMapInfo.jsx";
import SeqMapKey from "./SeqMapKey.jsx";
import { W, prepare, drawingOf, columnAt, centreOn } from "../seqMap.js";

// One map drawn at column width w, with the words and the key under it.
// Keyed by its strands, so a new set starts unpinned at its 5′ end, as
// seqmap.js draws it again. The column pointed at and the one kept by a click
// are this drawing's own, as the arc viewer's drag is.
function SeqMapView({ map, w = W }) {
  const [point, setPoint] = useState(null);
  const [pinned, setPinned] = useState(null);
  const svg = useRef(null);
  const scroll = useRef(null);
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
      <div ref={scroll} className="seqmap_scroll" tabIndex={0} aria-label="Sequence map, scrolls sideways">
        <SeqMapDrawing map={map} p={p} d={d} w={w} shown={shown} pinned={pinned} svgRef={svg}
                       onPointerMove={(ev) => { if (pinned === null && ev.pointerType === "mouse") setPoint(colAt(ev)); }}
                       onPointerLeave={() => { if (pinned === null) setPoint(null); }}
                       onClick={(ev) => { const i = colAt(ev); setPinned(pinned === i ? null : i); setPoint(i); }} />
      </div>
      <SeqMapInfo map={map} p={p} shown={shown} onJump={jump} />
      <SeqMapKey map={map} />
    </>
  );
}

export default SeqMapView;
