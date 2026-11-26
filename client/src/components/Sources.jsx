import { Fragment } from "react";
import SourceRow from "./SourceRow.jsx";

// Where each molecule came from (structure.ejs sources): what the kinds mean,
// then one row per source, a Notes column only when some source has notes.
function Sources({ sources }) {
  const { legend, rows, notes } = sources;
  const widths = notes ? [20, 9, 10, 23, 8, 16, 14] : [24, 10, 11, 27, 9, 19];
  return (
    <>
      <div className="source_legend">
        {legend.map((l, i) => <Fragment key={l.kind}>{i > 0 && " · "}<b>{l.kind}</b> = {l.text}</Fragment>)}
      </div>
      <div className="molecule_scroll">
        <table className="molecule_table source_table">
          {/* Widths never change once drawn, so their place is a safe key. */}
          <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <tbody>
            <tr>
              <th>Molecule</th><th>Chains</th><th>Obtained</th><th>Organism</th><th>Taxonomy ID</th><th>Produced in</th>
              {notes && <th>Notes</th>}
            </tr>
            {/* Rows come in the server's order and are never reordered. */}
            {rows.map((row, i) => <SourceRow key={i} row={row} notes={notes} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Sources;
