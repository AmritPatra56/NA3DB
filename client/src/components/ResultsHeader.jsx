// Above the results (search.ejs results_area_header): how many, the page size,
// the layout, the order and which ones are shown (app.js update_header).
// The controls show the address's choice; they act in 7.3 and 7.4.
function ResultsHeader({ registry, query, total, start, shown }) {
  return (
    <div className="results_area_header">
      <div className="results_count">
        <h1>Entries ({total})</h1>
        <label className="per_page_field">
          <span>Show</span>
          <input type="number" id="per_page" name="per_page" list="per_page_options" inputMode="numeric"
                 min="1" max={registry.max_page_size} step="1" defaultValue={query.perPage} />
          <datalist id="per_page_options">
            {registry.page_size_suggestions.map((n) => <option value={n} key={n}></option>)}
          </datalist>
          <span>per page</span>
        </label>
      </div>
      <div className="results_tools">
        <div className="view_switch" role="group" aria-label="Result layout">
          {[["grid", "Grid"], ["cards", "Cards"], ["lines", "Lines"]].map(([view, label]) => (
            <button type="button" key={view} data-view={view} aria-pressed={query.view === view}>{label}</button>
          ))}
        </div>
        <label className="sort_field">
          <span>Sort by</span>
          <select id="sort_by" name="sort" defaultValue={query.sort}>
            {registry.sorts.map((s) => <option value={s.key} key={s.key}>{s.label}</option>)}
          </select>
        </label>
        <span className="results_range">{total === 0 ? "" : `${start + 1} – ${start + shown} of ${total}`}</span>
      </div>
    </div>
  );
}

export default ResultsHeader;
