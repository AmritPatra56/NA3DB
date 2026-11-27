import GlyphIcon from "./GlyphIcon.jsx";
import { KIND, familyCounts, familyWords, isModified } from "../arcView.js";
import { number } from "../format.js";

function ArcSide({ pdbId, d, L, on, fam, listRef, onHover, onPick, onFamily }) {
  const rowClass = (i) => (isModified(d, L, i) ? "av_modres" : undefined);
  return (
    <div className="av_side">
      <div className="av_sec">
        <h4>Leontis–Westhof families</h4>
        <div className="av_fams">
          {d && familyCounts(d).map(([f, n]) => (
            <button key={f} type="button" className="av_fam" data-fam={f} aria-pressed={String(f === fam)}
                    title={familyWords(f)} onClick={() => onFamily(f)}>
              <GlyphIcon fam={f} />{f} <em>{number(n)}</em>
            </button>
          ))}
        </div>
        <p className="av_legend"><span>● Watson–Crick edge</span><span>■ Hoogsteen edge</span><span>▲ Sugar edge</span><span>filled cis · open trans</span></p>
        <p className="av_copynote" hidden={!d?.strands.some((s) => s.symmetry)}>′ marks a symmetry copy from the crystal</p>
      </div>
      <div className="av_list" ref={listRef}>
        <table>
          <thead><tr><th>#</th><th>Base 1</th><th>Base 2</th><th>Family</th><th>Type</th></tr></thead>
          <tbody className="av_rows" onMouseLeave={() => onHover(null)}>
            {d && L && d.pairs.map(([a, b, kind, , f, nameA, nameB], i) => (
              <tr key={i} data-i={i} hidden={Boolean(fam) && f !== fam} className={i === on ? "av_row_on" : undefined}
                  onMouseOver={() => onHover(i)} onClick={() => onPick(i)}>
                <td>{number(i + 1)}</td>
                <td className={rowClass(a)}>{nameA}</td>
                <td className={rowClass(b)}>{nameB}</td>
                <td><GlyphIcon fam={f} /> {f}</td>
                <td><i className={`av_sw arc_${kind}`}></i>{KIND[kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a className="av_table" href={`/structure/${encodeURIComponent(pdbId)}#base-pairs`}>Base pairs table on the entry page ↓</a>
    </div>
  );
}

export default ArcSide;
