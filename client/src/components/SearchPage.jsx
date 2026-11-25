import { useEffect } from "react";
import TopSearch from "./TopSearch.jsx";
import ChipsBar from "./ChipsBar.jsx";
import FilterPanel from "./FilterPanel.jsx";
import PanelHandle from "./PanelHandle.jsx";
import ResultsHeader from "./ResultsHeader.jsx";
import ResultsList from "./ResultsList.jsx";
import ResultsState from "./ResultsState.jsx";
import Pagination from "./Pagination.jsx";
import SearchNote from "./SearchNote.jsx";
import { useSearch } from "../hooks/useSearch.js";
import { withValue } from "../panelForm.js";
import { countLabel } from "../countLabel.js";

// /search: the one owner of the search, as WeatherApp owns the weather. Its
// state and rules are useSearch's; this page only hands them to its children,
// which show their props and call back up.
//
// SearchPage            the search and the reply (useSearch)
// ├─ TopSearch          Contains/Excludes, the box, its count
// ├─ ChipsBar           the filters in use, each one removable
// ├─ FilterPanel        the form → Category ×3 → TextField | SuggestField → NameList | NumberField | RangeField | PillGroup
// ├─ PanelHandle        folds the panel; the count of filters in use
// ├─ ResultsHeader      Entries (n), page size, layout, order, range
// ├─ SearchNote         how the box was read; the exact-phrase offer
// ├─ ResultsList → ResultCard | ResultLine | GridTile ×n
// ├─ ResultsState       spinner, error, No entries found → DidYouMean
// └─ Pagination         arrows and page buttons
// onAddress(search): the address changed, so the rail's link can carry it.
function SearchPage({ onAddress }) {
  const s = useSearch(onAddress);
  const { registry, query, panel, results, search } = s;

  useEffect(() => {
    document.title = "NA3DB · Full search";
  }, []);

  return (
    <div className="workspace">
      {/* A different answer, so back to its first page. */}
      {query && <TopSearch registry={registry} query={query} values={panel.values} onValue={s.onBox}
                           onMatch={(match) => search({ match, page: 1 })}
                           getSuggestPath={s.getSuggestPath} onPick={s.onBoxPick}
                           count={s.total.box} onSuggest={s.onBoxSuggest} />}
      {/* Chips of the search last answered; a removal searches the whole form. */}
      <ChipsBar chips={s.chips} onRemove={s.onRemove} />
      <div className="workspace_body">
        <FilterPanel registry={registry} panel={panel} counts={s.counts} asked={s.asked}
                     open={query?.panelOpen ?? true} busy={s.busy} label={countLabel(s.total.value)}
                     onValue={s.onValue} onFill={s.onFill} onPill={s.onPill}
                     onSubmit={() => search({ page: 1 })} />
        {/* A fold only goes in the address (set_panel): the page stays as it is. */}
        {query && <PanelHandle open={query.panelOpen} count={s.chips.length}
                               onToggle={() => search({ panelOpen: !query.panelOpen, page: results.page }, panel, true)} />}
        <div className="results_area">
          {/* A new order or page size is a new first page. A new layout redraws
              the page already here: the request leaves view out, so none is sent. */}
          {query && <ResultsHeader registry={registry} query={query}
                                   total={results.total} start={s.start} shown={results.results.length}
                                   onSort={(sort) => search({ sort, page: 1 })}
                                   onPerPage={(perPage) => search({ perPage, page: 1 })}
                                   onView={(view) => search({ view, page: results.page }, panel, true)} />}
          <SearchNote reply={s.note} onPhrase={(phrase) => search({ page: 1 }, withValue(panel, "q", phrase))} />
          <div className="results_area_body">
            <ResultsList entries={results.results} view={query?.view ?? "cards"} hidden={s.busy} />
            <ResultsState busy={s.busy} error={s.error?.message} empty={!s.busy && !s.error && results.total === 0}
                          suggestions={results.suggestions ?? []} getHref={s.getHref}
                          onPick={(x) => search({ page: 1 }, withValue(panel, x.field, x.value))} />
          </div>
          <Pagination page={results.page} pages={results.pages} onPage={(page) => search({ page })} />
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
