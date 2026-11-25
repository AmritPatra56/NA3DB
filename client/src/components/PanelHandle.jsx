// The drawer handle on the panel's edge. It folds the panel in 7.8.
function PanelHandle() {
  return (
    <div className="panel_edge">
      <button type="button" className="panel_handle" aria-controls="query_form" aria-expanded="true"
              aria-label="Hide the filters" title="Hide the filters">
        <i className="arrow arrow_side" aria-hidden="true"></i>
        <span className="handle_count" aria-hidden="true"></span>
      </button>
    </div>
  );
}

export default PanelHandle;
