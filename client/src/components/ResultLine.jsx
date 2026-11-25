import { entryHref, lineParts } from "../resultCard.js";
import { go } from "../address.js";

// One result as a line in the Lines view (app.js row_html): id, date and
// resolution on the left, title and method on the right. The whole line opens
// the structure page.
function ResultLine({ entry }) {
  const p = lineParts(entry);
  return (
    <div className="result_row" data-id={entry.pdb_id} onClick={() => go(entryHref(entry.pdb_id))}>
      <div className="result_meta">
        <div className="result_id">{entry.pdb_id}</div>
        <div className="result_date">{p.date}</div>
        <div className="result_res">{p.resolution}</div>
      </div>
      <div className="result_main">
        <div className="result_title">{entry.title}</div>
        <div className="result_method">{p.method}</div>
      </div>
    </div>
  );
}

export default ResultLine;
