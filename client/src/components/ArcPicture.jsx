import { Fragment } from "react";
import { Link } from "react-router";
import { ARC_KINDS, strandMiddle } from "../structure.js";
import { number, counted } from "../format.js";

// The base pairs drawn as arcs over their strands (structure.ejs arc_picture),
// with the views it can show (an assembly or the asymmetric unit) and what
// the picture leaves out or adds. view: /pairs' arc_view, its arcs present.
function ArcPicture({ pdbId, view }) {
  const a = view.arcs;
  const strands = a.chains.length;
  const labelled = strands <= 8;
  const strandWords = strands === 1 ? "one strand" : `${strands} strands`;
  const label = `Arc diagram: ${a.counts.drawn} base pairs drawn as arcs over ${strandWords} (${a.chains.map((c) => c.name).join(", ")}), ${number(a.counts.nucleotides)} nucleotides`;

  return (
    <figure className="arc_picture">
      {view.options.length > 0 && (
        <nav className="arc_views" aria-label="Which chains to draw">
          {view.options.map((o) => (
            <Link key={o.key} to={`?assembly=${o.key}#base-pairs`} preventScrollReset title={o.title}
                  aria-current={o.current ? "true" : undefined}>{o.label}</Link>
          ))}
        </nav>
      )}
      {/* The full viewer opens from here and from Expand (task 8.3.4). */}
      <button type="button" className="arc_zoom" data-arc-open={pdbId} data-arc-view={view.key} title="Expand">
        <svg viewBox={`0 0 ${a.width} ${a.height}`} role="img" aria-label={label}>
          {/* Strands are drawn once, in file order: their place is a safe key. */}
          {a.chains.map((c, i) => (
            <line key={i} className={`arc_strand${c.symmetry ? " arc_copy" : ""}`} x1={c.x1} y1={a.base} x2={c.x2} y2={a.base} />
          ))}
          <g className="arc_lines" strokeWidth={a.stroke}>
            {a.each
              ? a.each.map((e, i) => <path key={i} className={`arc_${e.kind}`} d={e.d}><title>{e.label}</title></path>)
              : <><path className="arc_nc" d={a.paths.nc} /><path className="arc_gu" d={a.paths.gu} /><path className="arc_wc" d={a.paths.wc} /></>}
          </g>
          {a.dot_path && <path className="arc_dot" d={a.dot_path} />}
          {labelled && a.chains.map((c, i) => (
            <Fragment key={i}>
              {c.x2 - c.x1 >= 30 && (
                <><text className="arc_name" x={c.x1} y={a.bottom + 14}>5′</text><text className="arc_name arc_end" x={c.x2} y={a.bottom + 14}>3′</text></>
              )}
              {(strands > 1 || c.symmetry) && c.x2 - c.x1 >= 12 && (
                <text className="arc_name arc_mid" x={strandMiddle(c)} y={a.bottom + 14}>{c.name}</text>
              )}
            </Fragment>
          ))}
        </svg>
      </button>
      <figcaption>
        <span>
          {counted(strands, "strand", "strands")} · {number(a.counts.nucleotides)} nt{a.each && " · hover an arc for its pair"}
          <button type="button" className="arc_full" data-arc-open={pdbId} data-arc-view={view.key} aria-expanded="false">⤢ Expand</button>
        </span>
        <span className="arc_key">
          {ARC_KINDS.filter(([kind]) => a.paths[kind]).map(([kind, text]) => <span key={kind}><i className={`arc_${kind}`}></i>{text}</span>)}
          {a.counts.modified > 0 && <span><i className="arc_mod"></i>modified</span>}
        </span>
        {view.about.map((line) => <span key={line} className="arc_note">{line}</span>)}
        {a.counts.copies > 0 && !view.assembly && <span className="arc_note">′ marks a copy from the crystal's symmetry</span>}
        {view.note && (
          <span className="arc_note">
            {view.note.text}
            {view.note.link && <> <Link to={`?assembly=${view.note.link}#base-pairs`} preventScrollReset>{view.note.link_text}</Link></>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export default ArcPicture;
