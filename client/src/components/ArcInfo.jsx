import GlyphIcon from "./GlyphIcon.jsx";
import { pairFacts } from "../arcView.js";
import { number } from "../format.js";

function ArcInfo({ d, L, on, note }) {
  let body;
  if (note) body = <span>{note}</span>;
  else if (on == null) {
    body = <><span className="av_k">Pair</span><b>Hover an arc or a row</b>
      <span>Every pair is in the list of pairs; pick a family to see only those.</span></>;
  } else {
    const [, , , , fam, nameA, nameB] = d.pairs[on];
    body = <><span className="av_k">Pair {number(on + 1)} of {number(d.pairs.length)}</span>
      <b>{nameA} – {nameB} <GlyphIcon fam={fam} /> {fam}</b>
      <span>{pairFacts(d, L, on)}</span></>;
  }
  return <div className="av_info" aria-live="polite">{body}</div>;
}

export default ArcInfo;
