import { useEffect } from "react";
import TopSearch from "./TopSearch.jsx";
import FilterPanel from "./FilterPanel.jsx";
import PanelHandle from "./PanelHandle.jsx";
import ResultsHeader from "./ResultsHeader.jsx";
import ResultsList from "./ResultsList.jsx";
import ResultsState from "./ResultsState.jsx";
import { useApi } from "../hooks/useApi.js";
import { queryFromAddress, entriesPath } from "../searchQuery.js";

// /search: the one owner of the search, as WeatherApp owns the weather. It
// reads what to search from the address, asks the server, and hands the reply
// down; everything below only shows its props (and, from 7.3, calls back up).
//
// SearchPage            the query and the reply
// ├─ TopSearch          Contains/Excludes, the box, its count
// ├─ FilterPanel        the categories (7.7) and Search
// ├─ PanelHandle        folds the panel (7.8)
// ├─ ResultsHeader      Entries (n), page size, layout, order, range
// ├─ ResultsList → ResultCard ×n
// └─ ResultsState       spinner, error, No entries found
function SearchPage() {
  // What the panel offers, from the same registry search.ejs is drawn from.
  const registry = useApi("/api/fields");
  const query = registry.data ? queryFromAddress(window.location.search, registry.data) : null;
  const reply = useApi(query ? entriesPath(query) : null);

  useEffect(() => {
    document.title = "NA3DB · Full search";
  }, []);

  const error = registry.error ?? reply.error;
  const busy = !error && !reply.data;
  const results = !error && reply.data ? reply.data : { results: [], total: 0, page: 1, page_size: 0 };
  const start = (results.page - 1) * results.page_size;

  return (
    <div className="workspace">
      {query && <TopSearch registry={registry.data} query={query} />}
      <div className="active_filters" role="group" aria-label="Filters in use"></div>
      <div className="workspace_body">
        <FilterPanel busy={busy} />
        <PanelHandle />
        <div className="results_area">
          {query && <ResultsHeader registry={registry.data} query={query}
                                   total={results.total} start={start} shown={results.results.length} />}
          <p className="search_note hidden" aria-live="polite"></p>
          <div className="results_area_body">
            <ResultsList entries={results.results} hidden={busy} />
            <ResultsState busy={busy} error={error?.message} empty={!busy && !error && results.total === 0} />
          </div>
          <div className="pagination"></div>
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
