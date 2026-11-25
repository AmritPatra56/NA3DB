// The filter panel (search.ejs query_panel). The categories are drawn from
// /api/fields in 7.7; until then the panel is its frame and its Search button,
// which waits while a search runs (set_loading).
function FilterPanel({ busy }) {
  return (
    <form className="query_panel" id="query_form">
      <div className="query_panel_header">
        <h1>Full search</h1>
      </div>
      <div className="query_panel_body"></div>
      <div className="query_panel_footer">
        <button type="submit" className="search" disabled={busy}>Search</button>
      </div>
    </form>
  );
}

export default FilterPanel;
