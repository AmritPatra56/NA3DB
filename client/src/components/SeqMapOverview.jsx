import { useMemo, useRef } from "react";
import { overviewOf } from "../seqMap.js";

// The whole ruler above the expanded map (seqmap.js overview): each strand a
// band, the steps' colours under it, the box that is the view (frame), and
// the strand names under it. A click or drag puts the view there: onCentre(column).
function SeqMapOverview({ map, p, frame, onCentre }) {
  const o = useMemo(() => overviewOf(map, p), [map, p]);
  const dragging = useRef(false);
  const centre = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    onCentre(Math.round((ev.clientX - r.left) / r.width * p.n));
  };
  return (
    <>
      <svg className="smd_overview" preserveAspectRatio="none" role="img" aria-label="The whole ruler; the box is the part on screen"
           viewBox={`0 0 ${p.n} 30`}
           onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); dragging.current = true; centre(ev); }}
           onPointerMove={(ev) => { if (dragging.current) centre(ev); }}
           onPointerUp={() => { dragging.current = false; }}>
        {o.bands.map((b) => <rect key={b.s} x={b.s} y="2" width={b.width} height="12" className={b.alt ? "smd_band smd_band_alt" : "smd_band"} />)}
        <g>{o.steps.map((s) => <rect key={s.n} x={s.i + 0.5} y="16" width="1" height="12" fill={s.fill} />)}</g>
        <rect className="smd_view" x={frame.x} y="0.5" width={frame.width} height="29" />
      </svg>
      <div className="smd_names">{o.names.map((n) => <span key={n.s} style={{ left: n.left }}>{n.name}</span>)}</div>
    </>
  );
}

export default SeqMapOverview;
