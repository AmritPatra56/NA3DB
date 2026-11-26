import { useEffect, useRef } from "react";
import { number } from "../format.js";
import { rowKey } from "../lbn.js";

// Every pair that is not a cWW one, folded under Show the N other pairs. A
// pair names its two nucleotides (data-a, data-b); selecting it shows it in
// the 1D view (onShowPair). rowOn: the row marked as the pair on show; find:
// the row to open the list at, from the 1D view (usePairLink).
function OtherPairs({ pairs, rowOn, find, onShowPair }) {
  const box = useRef(null);

  // Open the list at a row: unfolded, in sight, its link focused (views.js find_row).
  useEffect(() => {
    if (!find) return;
    const at = pairs.findIndex((p) => rowKey(p) === find.row);
    const tr = box.current.querySelectorAll("tbody tr")[at + 1];
    if (!tr) return;
    box.current.open = true;
    tr.scrollIntoView({ block: "center" });
    tr.querySelector(".pair_show")?.focus({ preventScroll: true });
  }, [find, pairs]);

  return (
    <details ref={box} id="bp-all" className="pair_list">
      <summary>Show the {number(pairs.length)} other pairs</summary>
      <p className="pair_hint">Select a pair to show it in the 1D view.</p>
      <div className="molecule_scroll">
        <table className="molecule_table pair_table">
          <tbody>
            <tr><th>Chain</th><th>Pair</th><th>Family</th></tr>
            {pairs.map((p) => (
              <tr key={rowKey(p)} data-a={p.ends[0]} data-b={p.ends[1]} className={rowKey(p) === rowOn ? "pair_on" : undefined}>
                <td>{p.chain}</td>
                <td><a className="pair_show" href="#views"
                       onClick={(e) => { e.preventDefault(); onShowPair(p.ends[0], p.ends[1], rowKey(p)); }}>{p.pair}</a></td>
                <td title={p.name}>{p.family}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default OtherPairs;
