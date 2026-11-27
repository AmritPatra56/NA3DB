import { Fragment, useState } from "react";

function Position({ position }) {
  return position.seen ? position.num : <span className="unmodelled" title="not modelled">{position.num}</span>;
}

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

function ModifiedTable({ group }) {
  const [all, setAll] = useState(false);
  const { rows, shown } = group;
  const folds = shown !== null && rows.length > shown;
  const head = folds ? rows.slice(0, shown) : rows;
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
