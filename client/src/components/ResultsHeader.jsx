import { useEffect, useRef } from "react";
import { perPageFrom } from "../searchQuery.js";

function ResultsHeader({ registry, query, total, start, shown, onSort, onPerPage, onView }) {
  const perPageBox = useRef(null);
  const sortBox = useRef(null);

  // An unknown sort selects nothing rather than the first option.
  useEffect(() => {
    if (!registry.sorts.some((s) => s.key === query.sort)) sortBox.current.selectedIndex = -1;
  });

  // The native change event, not onChange: typing 100 would search 1 and 10 first.
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
            <button type="button" key={view} data-view={view} aria-pressed={query.view === view}
                    onClick={() => view !== query.view && onView(view)}>{label}</button>
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
