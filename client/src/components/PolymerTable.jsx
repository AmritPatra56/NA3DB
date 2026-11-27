import MoleculeRow from "./MoleculeRow.jsx";

function PolymerTable({ pdbId, rows }) {
  return (
    <>
      <colgroup>
        <col style={{ width: "36%" }} /><col style={{ width: "10%" }} /><col style={{ width: "20%" }} />
        <col style={{ width: "14%" }} /><col style={{ width: "20%" }} />
      </colgroup>
      <tbody>
        <tr><th>Molecule</th><th>Chain</th><th>Modelled</th><th>Numbering</th><th>Link</th></tr>
        {rows.map((row) => <MoleculeRow key={row.entity_id} pdbId={pdbId} row={row} />)}
      </tbody>
    </>
  );
}

export default PolymerTable;
