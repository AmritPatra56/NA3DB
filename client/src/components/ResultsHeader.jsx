import { useEffect, useRef } from "react";
import { perPageFrom } from "../searchQuery.js";

// Above the results (search.ejs results_area_header): how many, the page size,
// the layout, the order and which ones are shown (app.js update_header).
// onSort(key), onPerPage(n): hand a new choice up to SearchPage. The layout
// switch acts in 7.4.
function ResultsHeader({ registry, query, total, start, shown, onSort, onPerPage }) {
  const perPageBox = useRef(null);
  const sortBox = useRef(null);

  // An order the menu does not offer leaves it showing none, as the old page
  // does; React would otherwise show the first option.
  useEffect(() => {
    if (!registry.sorts.some((s) => s.key === query.sort)) sortBox.current.selectedIndex = -1;
  });

  // The browser's own "change", not React's onChange (which fires per key):
  // typing 100 passes through 1 and 10, and each would be a search. The box
  // then shows the size in force, so a typed 5000 settles back to 200.
  useEffect(() => {
    const box = perPageBox.current;
    function settle() {
      box.value = perPageFrom(box.value, registry);
      onPerPage(Number(box.value));
    }
    box.addEventListener("change", settle);
    return () => box.removeEventListener("change", settle);
  }, [registry, onPerPage]);

  return (
    <div className="results_area_header">
      <div className="results_count">
        <h1>Entries ({total})</h1>
        <label className="per_page_field">
          <span>Show</span>
          <input ref={perPageBox} type="number" id="per_page" name="per_page" list="per_page_options" inputMode="numeric"
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
          <select ref={sortBox} id="sort_by" name="sort" value={query.sort} onChange={(e) => onSort(e.target.value)}>
            {registry.sorts.map((s) => <option value={s.key} key={s.key}>{s.label}</option>)}
          </select>
        </label>
        <span className="results_range">{total === 0 ? "" : `${start + 1} – ${start + shown} of ${total}`}</span>
      </div>
    </div>
  );
}

export default ResultsHeader;
