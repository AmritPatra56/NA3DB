import CiteSave from "./CiteSave.jsx";

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
