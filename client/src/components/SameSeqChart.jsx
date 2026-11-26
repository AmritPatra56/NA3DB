import { Fragment, useMemo, useState } from "react";
import SameSeqInfo from "./SameSeqInfo.jsx";
import SameSeqKey from "./SameSeqKey.jsx";
import { NtcRects } from "./NtcSwatch.jsx";
import { LABEL_W, chartOf, columnAt, lookupOf } from "../sameSeqChart.js";

// The comparison's picture (sameseq.js draw_chart, hover_setup): row names
// that stay put, then one ruler: A's backbone steps above the sequence, B's
// below, both chains' pairs in dot-bracket rows and each difference's number
// over it; the words and the key under it. Hover shows a column, a click
// pins it; a click on a number picks that difference (onMark).
// sel: the picked difference, { n }, or null; its first column shows until
// the pointer moves again.
function SameSeqChart({ d, w, sel, scrollRef, onMark }) {
  const c = useMemo(() => chartOf(d, w), [d, w]);
  const look = useMemo(() => lookupOf(d), [d]);
  // The pointer's column, with the pick it came after: a new pick shows its own.
  const [hover, setHover] = useState({ col: null, sel: undefined });
  const [pinned, setPinned] = useState(null);
  const picked = sel && d.diffs[sel.n - 1];
  const shown = hover.sel === sel ? hover.col : picked ? Math.min(...picked.cols) : null;

  const colAt = (ev) => columnAt(ev.currentTarget.getBoundingClientRect(), ev.clientX, w, c.n);
  const onMove = (ev) => { if (ev.pointerType === "mouse" && pinned === null) setHover({ col: colAt(ev), sel }); };
  const onLeave = (ev) => { if (ev.pointerType === "mouse" && pinned === null) setHover({ col: null, sel }); };
  // A click or tap pins the column, so the words stay while the reader
  // looks; another click on it lets go.
  const onClick = (ev) => {
    const mark = ev.target.closest(".ss_mark");
    if (mark) { onMark(Number(mark.dataset.n)); return; }
    const i = colAt(ev);
    setPinned(pinned === i ? null : i);
    setHover({ col: i, sel });
  };

  const band = (i, cls, extra) => <rect key={i} x={i * w} y={0} width={w} height={c.height} className={cls} {...extra} />;
  return (
    <div className="ss_chart">
      <div ref={scrollRef} className="seqmap_scroll ss_scroll" tabIndex={0} aria-label="Comparison picture, scrolls sideways">
        <svg className="seqmap_labels ss_labels" width={LABEL_W} height={c.height} aria-hidden="true">
          {/* A fixed list for this picture, so the place is a safe key. */}
          {c.labels.map((l, k) => <text key={k} x={6} y={l.y} className={"seqmap_label " + l.cls} style={l.fill ? { fill: l.fill } : undefined}>{l.text}</text>)}
        </svg>
        <svg className="seqmap_svg ss_svg" width={c.width} height={c.height} role="img"
             aria-label={`${d.a} against ${d.b}: ${c.n} nucleotides, ${d.diffs.length} differences, numbered`}
             onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick}>
          <g className="ss_hover">
            {shown !== null && <>{band(shown, "seqmap_band")}{look.links[shown].map((l) => band(l.to, "seqmap_partner_band", { opacity: 0.6 }))}</>}
          </g>
          <g className="ss_hl">{picked && picked.cols.map((i) => band(i, "ss_band"))}</g>
          <g className="seqmap_ruler">
            {c.ruler.map((r) => (
              <Fragment key={r.i}>
                <line x1={r.x} x2={r.x} y1={r.y + 10} y2={r.y + 14} />
                <text x={r.x} y={r.y + 8} textAnchor="middle">{r.num}</text>
              </Fragment>
            ))}
          </g>
          <g>
            <line x1={0} x2={c.width} y1={c.yA + 0.5} y2={c.yA + 0.5} className="seqmap_base" />
            {/* One bar per step of the reply: a fixed list, so the place is a safe key. */}
            {c.ups.map((rects, k) => <NtcRects key={k} rects={rects} />)}
          </g>
          <g transform={`translate(0 ${c.yB}) scale(1 -1)`}>
            <line x1={0} x2={c.width} y1={-0.5} y2={-0.5} className="seqmap_base" />
            {c.downs.map((rects, k) => <NtcRects key={k} rects={rects} />)}
          </g>
          {c.letters.map((l) => <text key={l.kind} x={l.x} y={c.ySeq + 14} className={`seqmap_seq seqmap_${l.kind}`}>{l.text}</text>)}
          {c.gaps.map((g) => <rect key={g.key} x={g.x} y={g.y} width={w - 4} height={2} className="ss_gap" />)}
          {c.rows.map((r) => <RowMarks key={r.k} r={r} w={w} />)}
          <g className="ss_marks">
            {c.marks.map((s) => (
              <g key={`${s.n} ${s.x}`} className={sel?.n === s.n ? "ss_mark ss_on" : "ss_mark"} data-n={s.n} transform={`translate(${s.x} ${s.y})`}>
                <circle r={s.r} />
                <text y={3.5} textAnchor="middle">{s.n}</text>
                <title>{s.title}</title>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <SameSeqInfo d={d} look={look} shown={shown} />
      <SameSeqKey d={d} />
    </div>
  );
}

// One pair row: the tints behind pairs only one chain has, the dots, then
// the brackets that cannot be compared and the rest in the row's colour.
function RowMarks({ r, w }) {
  return (
    <>
      {r.tints.map((t) => <rect key={t.i} x={t.x} y={r.tintY} width={w - 1} height={14} rx={3} className={t.cls} />)}
      <text x={r.dots} y={r.y} className="seqmap_dots">{r.dotText}</text>
      {r.marks.map((m) => (
        <text key={m.na ? "na" : "on"} x={m.x} y={r.y} className={m.na ? "seqmap_marks ss_na_text" : "seqmap_marks"}
              style={m.na ? undefined : { fill: r.colour }}>{m.text}</text>
      ))}
    </>
  );
}

export default SameSeqChart;
