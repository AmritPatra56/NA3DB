import NtcSwatch from "./NtcSwatch.jsx";
import { familyWords, rowColour } from "../seqMap.js";

export const HINT = "Hover or tap a column: its pairs and the steps on either side show here.";

// The step from column a to b, in words, its NtC drawn small.
function Step({ s, a, b, res }) {
  if (!s) return null;
  const where = `step ${res(a)}→${res(b)}: `;
  if (!s.ntc) return <span className="seqmap_step">{where}no NtC class{s.closest && ` (closest ${s.closest})`}</span>;
  return <span className="seqmap_step">{where}<NtcSwatch ntc={s.ntc} /> <b>{s.ntc}</b> {s.cana} · confal {s.confal ?? "–"}</span>;
}

// The words under the map (seqmap.js show): the shown column, its pairs with
// a jump to each partner, and the steps on either side. shown: a column or
// null; then note (a failed ask, in the full screen) or the hint.
function SeqMapInfo({ map, p, shown, note, onJump }) {
  const c = shown === null ? null : map.cols[shown];
  if (!c) return <div className="seqmap_info" aria-live="polite">{note ?? <span className="seqmap_hint">{HINT}</span>}</div>;
  const links = p.links[shown];
  return (
    <div className="seqmap_info" aria-live="polite">
      <b className="seqmap_res">{p.res(shown)}</b>{!c[2] && <> <em>not in the model</em></>}{" "}
      {links.length ? links.map((l) => {
        const wc = map.rows[l.k].name === "WC";
        return (
          <span key={`${l.k} ${l.other}`} className="seqmap_pair">
            <i style={{ background: rowColour(map.rows[l.k].name) }}></i>{wc ? "Watson–Crick" : l.family} with{" "}
            <button type="button" className="seqmap_jump" data-col={l.other} title={`Go to ${p.res(l.other)}`} onClick={() => onJump(l.other)}>{p.res(l.other)}</button>
            {!wc && <> <em>({familyWords(l.family)})</em></>}
          </span>
        );
      }) : <span className="seqmap_pair seqmap_none">unpaired</span>}
      <Step s={p.stepAt.get(shown - 1)} a={shown - 1} b={shown} res={p.res} />
      <Step s={p.stepAt.get(shown)} a={shown} b={shown + 1} res={p.res} />
    </div>
  );
}

export default SeqMapInfo;
