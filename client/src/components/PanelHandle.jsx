// The drawer handle on the panel's edge. The arrow shows which way the panel
// goes; folded, the handle stays on the edge with a count of the filters in
// use (shown by the CSS only while folded).
// onToggle: the handle clicked.
function PanelHandle({ open, count, onToggle }) {
  const label = open ? "Hide the filters" : "Show the filters";
  return (
    <div className="panel_edge">
      <button type="button" className="panel_handle" aria-controls="query_form" aria-expanded={open}
              aria-label={label} title={label} onClick={onToggle}>
        <i className="arrow arrow_side" aria-hidden="true"></i>
        <span className="handle_count" aria-hidden="true">{count || ""}</span>
      </button>
    </div>
  );
}

export default PanelHandle;
