import { PREVIEW_ROWS, cellText } from "../report.js";
import { number } from "../format.js";

// The file as it will be downloaded (render_preview): the ticked fields, the
// first rows, and a note when there are more. rows: the reply's results.
function ReportPreview({ fields, rows }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <>
      <div className="preview_scroll">
        <table className="preview_table">
          <thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
          {/* Index keys: a row has no id of its own (an entry has many molecules) and the list is redrawn whole. */}
          <tbody>{shown.map((row, i) => <tr key={i}>{fields.map((f) => <td key={f.key}>{cellText(row[f.key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <p className="preview_note">Showing the first {shown.length} of {number(rows.length)} rows. The download has all of them.</p>
      )}
    </>
  );
}

export default ReportPreview;
