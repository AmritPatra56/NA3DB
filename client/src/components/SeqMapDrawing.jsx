import { Fragment } from "react";
import { NtcRects } from "./NtcSwatch.jsx";
import { LABEL_W, Y_SEQ, Y_BASE, rowY } from "../seqMap.js";

// The pointer's marks: a band over the column, bands and rings on its partners.
function Hover({ d, p, shown, w }) {
  if (shown === null || !p.links[shown]) return null;
  const band = (i, cls) => <rect x={i * w + w / 2 - d.band / 2} y="0" width={d.band} height={d.height} className={cls} />;
  return (
    <>
      {band(shown, "seqmap_band")}
      {p.links[shown].map((l) => (
        <Fragment key={`${l.k} ${l.other}`}>
          {band(l.other, "seqmap_band seqmap_partner_band")}
          <circle cx={d.xOf(l.other)} cy={rowY(l.k)} r={Math.max(4, Math.min(6.5, w / 2 + 1))} className="seqmap_ring" />
          <circle cx={d.xOf(l.other)} cy={Y_SEQ + 10} r={Math.max(4, Math.min(8, w / 2 + 2))} className="seqmap_ring" />
        </Fragment>
      ))}
    </>
  );
}

// The row names, then the map itself (seqmap.js draw_map), from d
// (seqMap.js drawingOf) at column width w.
function SeqMapDrawing({ map, p, d, w, shown, pinned, svgRef, onPointerMove, onPointerLeave, onClick }) {
  return (
    <>
      <svg className="seqmap_labels" width={LABEL_W} height={d.height} aria-hidden="true">
        <text x="4" y={Y_SEQ + 14} className="seqmap_label">seq</text>
        <text x="4" y={Y_BASE - 8} className="seqmap_label">NtC</text>
        {map.rows.map((r, k) => (
          // Rows come in a fixed order with the map: the place is a safe key.
          <text key={k} x="4" y={rowY(k) + 4} className={`seqmap_label${r.overflow ? " seqmap_over" : ""}`} style={{ fill: d.rows[k].colour }}>{r.name}</text>
        ))}
      </svg>
      <svg ref={svgRef} className={`seqmap_svg${pinned !== null ? " seqmap_pinned" : ""}`} width={d.width} height={d.height} role="img"
           aria-label={`Sequence map of ${map.names.join(", ")}: ${p.n - map.names.length + 1} nucleotides, ${map.steps.length} NtC steps, ${map.rows.length} rows of pairs`}
           onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onClick={onClick}>
        <g className="seqmap_hover"><Hover d={d} p={p} shown={shown} w={w} /></g>
        <g className="seqmap_ruler">
          {d.ruler.map((m) => m.strand
            ? <text key={m.i} x={m.x} y="11" className="seqmap_strand">{m.strand}</text>
            : <Fragment key={m.i}><line x1={m.x} x2={m.x} y1="12" y2="16" /><text x={m.x} y="10" textAnchor="middle">{m.num}</text></Fragment>)}
        </g>
        {d.seps.map((s) => <line key={s.i} x1={s.x} x2={s.x} y1="2" y2={d.height - 2} className="seqmap_sep" />)}
        {d.letters.map((l) => <text key={l.kind} x={l.x} y={Y_SEQ + 14} className={`seqmap_seq seqmap_${l.kind}`}>{l.text}</text>)}
        {d.lines && (
          <>
            {d.lines.runs.map((r) => <rect key={r.x} x={r.x} y={Y_SEQ + 7} width={r.width} height="4" className="seqmap_line" />)}
            {d.lines.gone.map((x) => <rect key={x} x={x} y={Y_SEQ + 7} width={w} height="4" className="seqmap_line_gone" />)}
            {d.lines.mod.map((x) => <rect key={x} x={x} y={Y_SEQ + 3} width={Math.max(1, w)} height="12" className="seqmap_line_mod" />)}
          </>
        )}
        <g>
          <line x1="0" x2={d.width} y1={Y_BASE + 0.5} y2={Y_BASE + 0.5} className="seqmap_base" />
          {d.bars.map((b) => b.rects
            ? <NtcRects key={b.i} rects={b.rects} />
            : <rect key={b.i} x={b.thin.x} y={Y_BASE - 3} width={b.thin.width} height="3" className="seqmap_nan_thin" />)}
        </g>
        {d.rows.map((r) => d.wide ? (
          <Fragment key={r.k}>
            <text x={r.dots} y={r.y} className="seqmap_dots">{r.dotText}</text>
            <text x={r.marks} y={r.y} className="seqmap_marks" style={{ fill: r.colour }}>{r.markText}</text>
          </Fragment>
        ) : (
          <g key={r.k} style={{ fill: r.colour }}>
            {/* A nucleotide pairs once per row, so its place is unique. */}
            {r.ticks.map((x) => <rect key={x} x={x} y={rowY(r.k) - 4} width={Math.max(0.8, w)} height="8" />)}
          </g>
        ))}
      </svg>
    </>
  );
}

export default SeqMapDrawing;
