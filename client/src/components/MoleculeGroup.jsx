import MoleculeRow from "./MoleculeRow.jsx";

// One table of the Molecules section: DNA, RNA, Protein and so on.
function MoleculeGroup({ pdbId, group }) {
  return (
    <details className="molecule_group" open={!group.folded}>
      <summary>{group.title} ({group.rows.length})</summary>
      <div className="molecule_scroll">
        <table className="molecule_table">
          <colgroup>
            <col style={{ width: "36%" }} /><col style={{ width: "10%" }} /><col style={{ width: "20%" }} />
            <col style={{ width: "14%" }} /><col style={{ width: "20%" }} />
          </colgroup>
          {/* EJS leaves tbody out and the browser adds it; React wants it written. */}
          <tbody>
            <tr><th>Molecule</th><th>Chain</th><th>Modelled</th><th>Numbering</th><th>Link</th></tr>
            {group.rows.map((row) => <MoleculeRow key={row.entity_id} pdbId={pdbId} row={row} />)}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default MoleculeGroup;
