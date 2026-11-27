import { Fragment, useEffect, useRef, useState } from "react";
import LwGlyph from "./LwGlyph.jsx";
import { drawing, endsOf, letters, nearestPair, pictureOf, ruler, strokeOf } from "../arcView.js";

function ArcStage({ d, view, svgRef, onPointed }) {
  const { f, L, z, on, fam, lit } = view;
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const point = (ev) => pictureOf(svgRef.current.getBoundingClientRect(), f, ev);
  const nearest = (ev) => nearestPair(d, f, L, z, fam, point(ev));

  // A native listener: React's onWheel is passive and cannot stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!f) return;
    const wheel = (ev) => {
      ev.preventDefault();
      view.onZoom(ev.deltaY < 0 ? 1.25 : 0.8, pictureOf(svg.getBoundingClientRect(), f, ev).x);
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [svgRef, f, view]);

  const events = f && {
    onPointerDown: (ev) => {
      const i = nearest(ev);
      if (i != null) { view.onPick(i); return; }
      drag.current = { x: point(ev).x, tx: z.tx };
      setDragging(true);
      ev.currentTarget.setPointerCapture(ev.pointerId);
    },
    onPointerMove: (ev) => {
      if (drag.current) { view.onPan(drag.current.tx + point(ev).x - drag.current.x); return; }
      if (ev.pointerType === "mouse") onPointed(nearest(ev));
    },
    onPointerLeave: () => { if (!drag.current) view.onHover(null); },
    onPointerUp: () => { drag.current = null; setDragging(false); },
  };

  let body = null;
  if (f) {
    const { strands, arcs } = drawing(d, f, L, z);
    const low = f.base + f.depth;
    // The pointed pair last, so it is drawn on top.
    const order = arcs.map((_, i) => i).filter((i) => i !== on);
    if (on != null) order.push(on);
    const lift = (i) => (lit?.(i) ? " av_on" : "");
    body = (
      <>
        <g>
          {ruler(d, f, L, z).map((r) => (
            <Fragment key={r.key}>
              {r.ticks.map((t) => (
                <Fragment key={t.p}>
                  <line x1={t.x} y1={low + 22} x2={t.x} y2={low + 27} className="av_tick" />
                  <text x={t.x} y={low + 52} className="av_ticklabel">{t.p}</text>
                </Fragment>
              ))}
              {r.ends && <><text x={r.ends[0]} y={low + 40} className="av_label">5′</text><text x={r.ends[1]} y={low + 40} className="av_label av_right">3′</text></>}
              {r.name && <text x={r.name.x} y={low + 40} className="av_label av_name">{r.name.text}</text>}
            </Fragment>
          ))}
        </g>
        {d.strands.map((s, j) => (
          <line key={j} y1={f.base} y2={f.base} className={`arc_strand${s.symmetry ? " arc_copy" : ""}`} x1={strands[j][0]} x2={strands[j][1]} />
        ))}
        <g className="arc_lines" strokeWidth={strokeOf(d)}>
          {order.map((i) => <path key={i} className={`arc_${d.pairs[i][2]}${lift(i)}`} data-i={i} d={arcs[i].path} />)}
        </g>
        <g className="av_glyphs">
          {arcs.map((a, i) => a.symbol && (
            <g key={i} data-i={i} className={`av_sym${lift(i)}`}><LwGlyph fam={d.pairs[i][4]} x={a.symbol.x} y={a.symbol.y} /></g>
          ))}
        </g>
        <g>
          {letters(d, f, L, z).map((m) => (m.letter === null
            ? <circle key={m.key} cx={m.x} cy={f.base} r={3.5} className="av_mod" />
            : <Fragment key={m.key}>
                {m.mod && <circle cx={m.x} cy={f.base + 12} r={6.5} className="av_mod" />}
                <text x={m.x} y={f.base + 15.5} className={`av_letter${m.mod ? " av_letter_mod" : ""}`}>{m.letter}</text>
              </Fragment>))}
          {on != null && endsOf(d, L, z, on).map((x, k) => <circle key={k} cx={x} cy={f.base} r={5.5} className="av_end" />)}
        </g>
      </>
    );
  }

  return (
    <svg ref={svgRef} className={`av_svg${lit ? " av_dim" : ""}${dragging ? " av_drag" : ""}`}
         preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arc diagram, expanded"
         viewBox={f ? `0 0 ${f.W} ${f.H}` : undefined} {...events}>
      {body}
    </svg>
  );
}

export default ArcStage;
