import { Fragment, useState } from "react";

// A position, greyed with a title when no chain models it.
function Position({ position }) {
  return position.seen ? position.num : <span className="unmodelled" title="not modelled">{position.num}</span>;
}

// Positions as "8, 12, 47", each with its place in the list as a key: the
// list is drawn once and never reordered.
const positions = (list) => list.map((p, i) => <Fragment key={i}>{i > 0 && ", "}<Position position={p} /></Fragment>);

function ModifiedRow({ row }) {
  return (
    <tr>
      <td><a target="_blank" rel="noopener" href={row.url}>{row.code}</a></td>
      <td>{row.name ?? <span className="molecule_sub">none</span>}</td>
      <td><span title={row.chain.title ?? undefined}>{row.chain.name}</span></td>
      <td>
        {positions(row.shown)}
        {row.rest.length > 0 && (
          <details className="more_positions"><summary>+ {row.rest.length} more</summary>{positions(row.rest)}</details>
        )}
      </td>
    </tr>
  );
}

// The modified nucleotides: the first group.shown rows, the rest behind Show
// all N. Whether they show is this table's own look, not the page's data.
function ModifiedTable({ group }) {
  const [all, setAll] = useState(false);
  const { rows, shown } = group;
  const folds = shown !== null && rows.length > shown;
  const head = folds ? rows.slice(0, shown) : rows;
  // A code can sit on several chains, so code and chain together name a row.
  const key = (row) => `${row.code}:${row.chain.name}`;

  return (
    <>
      <colgroup>
        <col style={{ width: "12%" }} /><col style={{ width: "46%" }} /><col style={{ width: "10%" }} /><col style={{ width: "32%" }} />
      </colgroup>
      <thead><tr><th>Code</th><th>Name</th><th>Chain</th><th>Positions</th></tr></thead>
      <tbody>{head.map((row) => <ModifiedRow key={key(row)} row={row} />)}</tbody>
      {folds && (
        <>
          <tbody className="more_rows" hidden={!all}>{rows.slice(shown).map((row) => <ModifiedRow key={key(row)} row={row} />)}</tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button type="button" className="more_rows_toggle" aria-expanded={all} onClick={() => setAll(!all)}>
                  <span>{all ? "Show fewer" : `Show all ${rows.length}`}</span> <i className="arrow" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          </tfoot>
        </>
      )}
    </>
  );
}

export default ModifiedTable;
