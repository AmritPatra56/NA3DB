import ArcPicture from "./ArcPicture.jsx";
import OtherPairs from "./OtherPairs.jsx";
import { number, counted } from "../format.js";

// The Base pairs section (structure.ejs): the arc picture, then the pairs
// counted by class in a bar, the other families, which chains pair with
// which, and the other pairs one by one. bp: /pairs' base_pairs.
function BasePairs({ pdbId, bp, view, expanded, onExpand, onCollapse }) {
  const extra = bp.links.slice(bp.links_shown);
  return (
    <>
      {view.arcs && <ArcPicture pdbId={pdbId} view={view} expanded={expanded} onExpand={onExpand} onCollapse={onCollapse} />}
      <div className="jump_to">
        Jump to: <a href="#bp-counts">Counts</a>
        {bp.families.length > 0 && <> · <a href="#bp-families">Families</a></>}
        {bp.noncanonical.length > 0 && <> · <a href="#bp-all">Other pairs</a></>}
      </div>
      <div className="source_legend pair_head">
        <span>{counted(bp.total, "pair", "pairs")}, Leontis–Westhof classes from DNATCO</span>
      </div>
      <div id="bp-counts" className="pair_bar" role="img" aria-label={bp.bar.map((b) => `${b.n} ${b.label}`).join(", ")}>
        {bp.bar.filter((b) => b.n).map((b) => (
          <span key={b.kind} className={`pair_${b.kind}`} style={{ flex: b.n }}>
            {b.percent >= 15 && <>{number(b.n)}<span className="pair_bar_label">{b.label}</span></>}
          </span>
        ))}
      </div>
      <div className="pair_legend">
        {bp.bar.map((b) => <span key={b.kind}><i className={`pair_${b.kind}`}></i>{b.label} {number(b.n)}</span>)}
      </div>
      {bp.families.length > 0 && (
        <>
          <div id="bp-families" className="pair_caption">Others, by Leontis–Westhof family</div>
          <div className="pair_families">
            {bp.families.map((f) => <span key={f.family} title={f.name}>{f.family} {number(f.n)}</span>)}
          </div>
        </>
      )}
      {bp.sentence ? <p className="pair_chains">{bp.sentence}</p> : (
        <>
          <ul className="pair_links">{bp.links.slice(0, bp.links_shown).map((l) => <li key={`${l.a} ${l.b}`}>{l.text}</li>)}</ul>
          {extra.length > 0 && (
            <details className="more_positions">
              <summary>{extra.length} more chain pairings</summary>
              <ul className="pair_links">{extra.map((l) => <li key={`${l.a} ${l.b}`}>{l.text}</li>)}</ul>
            </details>
          )}
        </>
      )}
      {bp.noncanonical.length > 0 && <OtherPairs pairs={bp.noncanonical} />}
    </>
  );
}

export default BasePairs;
