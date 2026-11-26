import { fieldGroups } from "../report.js";

// The open table's checkboxes, one block per group (fields_html), with the
// table's option above them. Entry ID is ticked for good: it joins the tables.
function ReportFields({ table, ticks, idField, option, onOption, onTick }) {
  return (
    <div className="query_panel_body" id="report_fields" role="tabpanel" aria-labelledby={`table-${table.key}`}>
      <p className="report_row_note">{table.row}</p>
      {table.option && (
        <div className="report_group report_option">
          <label className="check_row">
            <input type="checkbox" id="table_option" checked={option} onChange={(e) => onOption(e.target.checked)} />
            <span>{table.option.label}</span>
          </label>
        </div>
      )}
      {fieldGroups(table).map((group) => (
        <div className="report_group" key={group.name}>
          <h2 className="report_group_title">{group.name}</h2>
          {group.fields.map((field) => (
            <label className="check_row" key={field.key}>
              <input type="checkbox" className="field_box" value={field.key} checked={ticks.includes(field.key)}
                     disabled={field.key === idField} onChange={(e) => onTick(field.key, e.target.checked)} />
              <span>{field.label}</span>
              {field.key === idField && <span className="check_always">always</span>}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export default ReportFields;
