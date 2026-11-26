import { useEffect } from "react";
import ReportTabs from "./ReportTabs.jsx";
import ReportFields from "./ReportFields.jsx";
import ReportPreview from "./ReportPreview.jsx";
import { useApi } from "../hooks/useApi.js";
import { useReport } from "../hooks/useReport.js";
import { useFieldsFold } from "../hooks/useFieldsFold.js";
import { chosenFields } from "../report.js";
import { number } from "../format.js";

// The report (report.ejs). It waits for /api/fields, which the old page had
// injected, then the Report draws with it.
function ReportPage() {
  const fields = useApi("/api/fields");
  const help = useApi("/api/help");

  useEffect(() => {
    document.title = "NA3DB report";
  }, []);

  return fields.data && <Report registry={fields.data} why={help.data?.["report-tables"]} />;
}

// The ZIP button's words in each state (download_all).
const ZIP_SAY = { idle: "Download all (ZIP)", busy: "Preparing…", failed: "Download failed, try again" };

// ReportPage            waits for the registry
// └─ Report             the open table and its rows (useReport)
//    ├─ ReportTabs      one tab per table
//    ├─ ReportFields    the option and the checkboxes
//    └─ ReportPreview   the first rows as the file has them
function Report({ registry, why }) {
  const r = useReport(registry);
  const { table, rows } = r;
  const fold = useFieldsFold();
  const { open, label } = fold;
  const heading = rows.loading ? "Loading…" : rows.data ? `${table.name} (${number(rows.data.total)})` : table.name;

  return (
    <>
      <div className={`query_panel${open ? "" : " folded"}`} id="report_panel" inert={fold.inert}>
        <div className="query_panel_header">
          <h1>Report</h1>
        </div>
        <ReportTabs tables={r.tables} current={table.key} onTable={r.onTable} />
        <details className="guide report_why">
          <summary>Why three tables?</summary>
          <div className="guide_body"><p>{why}</p></div>
        </details>
        <ReportFields table={table} ticks={r.ticks} idField={r.idField} option={r.option}
                      onOption={r.onOption} onTick={r.onTick} />
        <div className="query_panel_footer">
          <div className="report_downloads">
            <button type="button" className="download" id="export_button" disabled={!rows.data?.results.length}
                    onClick={r.onCsv}>Download CSV</button>
            <button type="button" className="download" id="zip_button" disabled={r.zip.state === "busy"}
                    onClick={r.zip.onZip}>{ZIP_SAY[r.zip.state]}</button>
          </div>
        </div>
      </div>
      <div className="panel_edge">
        <button type="button" className="panel_handle fields_handle" aria-controls="report_panel"
                aria-expanded={open} aria-label={label} title={label} onClick={fold.onToggle}>
          <i className="arrow arrow_side" aria-hidden="true"></i>
        </button>
      </div>
      <div className="results_area">
        <div className="results_area_header">
          <h1 className="report_count">{heading}</h1>
          <button type="button" className="fields_toggle" aria-expanded={open} aria-label="Show or hide the fields"
                  onClick={fold.onToggle}>
            <i className="arrow arrow_side" aria-hidden="true"></i>
          </button>
        </div>
        <div className="results_area_body report_body">
          <div className="report_preview">
            {rows.error ? <p className="preview_note">{rows.error.message}</p>
              : rows.data && <ReportPreview fields={chosenFields(table, r.ticks)} rows={rows.data.results} />}
          </div>
        </div>
      </div>
    </>
  );
}

export default ReportPage;
