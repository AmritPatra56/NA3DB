import { useEffect, useState } from "react";
import TopSearch from "./TopSearch.jsx";
import FilterPanel from "./FilterPanel.jsx";
import PanelHandle from "./PanelHandle.jsx";
import ResultsHeader from "./ResultsHeader.jsx";
import ResultsList from "./ResultsList.jsx";
import ResultsState from "./ResultsState.jsx";
import Pagination from "./Pagination.jsx";
import { useApi } from "../hooks/useApi.js";
import { queryFromAddress, entriesPath, addressOf } from "../searchQuery.js";

const NOTHING = { results: [], total: 0, page: 1, page_size: 0, pages: null };

// /search: the one owner of the search, as WeatherApp owns the weather. The
// search is read from the address, and every change is written back there
// (with a history entry, so Back works) as it is asked for. Everything below
// only shows its props and calls back up.
//
// SearchPage            the search and the reply
// ├─ TopSearch          Contains/Excludes, the box, its count
// ├─ FilterPanel        the categories (7.7) and Search
// ├─ PanelHandle        folds the panel (7.8)
// ├─ ResultsHeader      Entries (n), page size, layout, order, range
// ├─ ResultsList → ResultCard | ResultLine | GridTile ×n
// ├─ ResultsState       spinner, error, No entries found
// └─ Pagination         arrows and page buttons
function SearchPage() {
  // What the panel offers, from the same registry search.ejs is drawn from.
  const registry = useApi("/api/fields");
  // The search starts as the address says; after a change it is what was
  // chosen, and the address only follows it (as the old form is the search
  // and update_url writes it out): a link's odd sort stays "none" on page 2.
  const [chosen, setChosen] = useState(null);
  const query = chosen ?? (registry.data ? queryFromAddress(window.location.search, registry.data) : null);
  const reply = useApi(query ? entriesPath(query) : null);

  useEffect(() => {
    document.title = "NA3DB · Full search";
  }, []);

  // A changed search (update_url): into the address unless it already is
  // that search, then searched.
  function search(next) {
    const url = window.location.pathname + addressOf(next, registry.data);
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
    setChosen(next);
  }

  const error = registry.error ?? reply.error;
  const busy = !error && !reply.data;
  // While the next page loads, everything keeps the last answer (the list
  // only hidden), as the old page leaves it until the new one comes; an
  // error clears it.
  const results = error ? NOTHING : reply.data ?? reply.stale ?? NOTHING;
  const start = (results.page - 1) * results.page_size;

  return (
    <div className="workspace">
      {query && <TopSearch registry={registry.data} query={query} />}
      <div className="active_filters" role="group" aria-label="Filters in use"></div>
      <div className="workspace_body">
        <FilterPanel busy={busy} />
        <PanelHandle />
        <div className="results_area">
          {/* A new order or page size is a new first page. A new layout redraws
              the page already here: the request leaves view out, so none is sent. */}
          {query && <ResultsHeader registry={registry.data} query={query}
                                   total={results.total} start={start} shown={results.results.length}
                                   onSort={(sort) => search({ ...query, sort, page: 1 })}
                                   onPerPage={(perPage) => search({ ...query, perPage, page: 1 })}
                                   onView={(view) => search({ ...query, view, page: results.page })} />}
          <p className="search_note hidden" aria-live="polite"></p>
          <div className="results_area_body">
            <ResultsList entries={results.results} view={query?.view ?? "cards"} hidden={busy} />
            <ResultsState busy={busy} error={error?.message} empty={!busy && !error && results.total === 0} />
          </div>
          <Pagination page={results.page} pages={results.pages}
                      onPage={(page) => search({ ...query, page })} />
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
