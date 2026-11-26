import { number } from "../format.js";

// Every pair that is not a cWW one, folded under Show the N other pairs. A
// pair names its two nucleotides (data-a, data-b) so the 1D view can show it
// and find it back (task 8.3.5).
function OtherPairs({ pairs }) {
  return (
    <details id="bp-all" className="pair_list">
      <summary>Show the {number(pairs.length)} other pairs</summary>
      <p className="pair_hint">Select a pair to show it in the 1D view.</p>
      <div className="molecule_scroll">
        <table className="molecule_table pair_table">
          <tbody>
            <tr><th>Chain</th><th>Pair</th><th>Family</th></tr>
            {pairs.map((p) => (
              <tr key={`${p.ends.join("|")}|${p.family}`} data-a={p.ends[0]} data-b={p.ends[1]}>
                <td>{p.chain}</td>
                <td><a className="pair_show" href="#views">{p.pair}</a></td>
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
