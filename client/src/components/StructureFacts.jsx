import CiteSave from "./CiteSave.jsx";

// One label and value per row, as the rows arrive from /api/entries/:id.
// The server already leaves out empty rows, so 1OLN (NMR) has no Resolution.
// cited: the entry has a citation, saved from beside Published.
function StructureFacts({ rows, pdbId, cited }) {
  return (
    <>
      {rows.map((row) => (
        <div className={row.key === "title" ? "detail_field structure_lead" : "detail_field"} key={row.key}>
          <div className="detail_label">{row.label}</div>
          {row.key === "published"
            ? <div className="detail_value published_value"><span>{row.value}</span>{cited && <CiteSave pdbId={pdbId} where="top" />}</div>
            : <div className="detail_value">{row.value}</div>}
        </div>
      ))}
    </>
  );
}

export default StructureFacts;
