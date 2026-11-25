import { useEffect, useState } from "react";
import TopSearch from "./TopSearch.jsx";
import FilterPanel from "./FilterPanel.jsx";
import PanelHandle from "./PanelHandle.jsx";
import ResultsHeader from "./ResultsHeader.jsx";
import ResultsList from "./ResultsList.jsx";
import ResultsState from "./ResultsState.jsx";
import Pagination from "./Pagination.jsx";
import SearchNote from "./SearchNote.jsx";
import { useApi } from "../hooks/useApi.js";
import { queryFromAddress, entriesPath, countPath, boxSuggestPath, addressOf, suggestionHref, excludedOf } from "../searchQuery.js";
import { searchable } from "../query.js";
import { panelFromParams, filtersOfPanel, withValue, withPill } from "../panelForm.js";
import { chipsOf, withoutChip } from "../chips.js";
import ChipsBar from "./ChipsBar.jsx";
import { countLabel } from "../countLabel.js";

const NOTHING = { results: [], total: 0, page: 1, page_size: 0, pages: null };
const COUNT_SETTLE_MS = 250;

// /search: the one owner of the search, as WeatherApp owns the weather. The
// search is read from the address, and every change is written back there
// (with a history entry, so Back works) as it is asked for. Everything below
// only shows its props and calls back up.
//
// SearchPage            the search and the reply
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
  // What the panel offers, from the same registry search.ejs is drawn from.
  const registry = useApi("/api/fields");
  // The search starts as the address says; after a change it is what was
  // chosen, and the address only follows it (as the old form is the search
  // and update_url writes it out): a link's odd sort stays "none" on page 2.
  const [chosen, setChosen] = useState(null);
  const query = chosen ?? (registry.data ? queryFromAddress(window.location.search, registry.data) : null);
  // Every search asks again, even one the same as the last (run_search).
  const [round, setRound] = useState(0);
  const reply = useApi(query ? entriesPath(query) : null, 0, round);
  const counts = useApi("/api/pill_counts");
  // The panel's form (the top box is part of it), set from the address until
  // it is first changed. Every search is read from it, typed-in edits too.
  const [edited, setEdited] = useState(null);
  const panel = edited ?? (registry.data ? panelFromParams(new URLSearchParams(window.location.search), registry.data) : null);
  // Every value the page was opened with: a pill no entry has still shows if
  // the link picked it.
  const [asked] = useState(() => [...new URLSearchParams(window.location.search).values()].flatMap((v) => v.split(",")));

  useEffect(() => {
    document.title = "NA3DB · Full search";
  }, []);

  // Into the address with a history entry, unless it already is that search;
  // the rail's search link follows (sync_rail_links).
  function toAddress(search) {
    const url = window.location.pathname + search;
    if (url === window.location.pathname + window.location.search) return;
    window.history.pushState(null, "", url);
    onAddress(window.location.search);
  }

  // A changed search (update_url), its filters read from the form (read_filters):
  // into the address unless it already is that search, then searched.
  // form: the form as this change leaves it. redraw: only a new layout, so the
  // address takes the form but nothing is asked again (as the old page does).
  const filtersOf = (form, excluded = excludedOf(query.filters)) => ({ ...filtersOfPanel(form, registry.data), ...excluded });
  // excluded: the not_ filters this search keeps; only removing a chip changes them.
  function search(change, form = panel, redraw = false, excluded = undefined) {
    const next = { ...query, ...change, filters: filtersOf(form, excluded) };
    toAddress(addressOf(next, registry.data));
    setEdited(form);
    setChosen(redraw ? { ...next, filters: query.filters } : next);
    if (!redraw) {
      setRound(round + 1);
      // The answer brings its own number; a count still on its way is dropped.
      setCounting({ form: null, round: counting.round });
    }
  }

  // The Search button's count (count_soon): every edit asks again once the
  // typing pauses, the same filters too, as every input or pill click does.
  const [counting, setCounting] = useState({ form: null, round: 0 });
  const count = useApi(counting.form ? countPath({ filters: filtersOf(counting.form), match: query.match }) : null,
                       COUNT_SETTLE_MS, counting.round);
  function edit(form) {
    setEdited(form);
    setCounting({ form, round: counting.round + 1 });
  }
  const onValue = (name, value) => edit(withValue(panel, name, value));

  // On load the address is written out as the search reads it, as run_search
  // does at once: an odd link (page=1, a sort the menu lacks) is tidied.
  useEffect(() => {
    if (registry.data) toAddress(addressOf(queryFromAddress(window.location.search, registry.data), registry.data));
  }, [registry.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back and Forward: the address has changed already, so the form is refilled
  // from it and searched again. The panel stays folded or open as it is, as
  // the old page leaves it, so the address may take panel=closed again.
  useEffect(() => {
    function back() {
      const was = queryFromAddress(window.location.search, registry.data);
      search({ ...was, panelOpen: query.panelOpen }, panelFromParams(new URLSearchParams(window.location.search), registry.data),
             false, excludedOf(was.filters));
    }
    if (!query) return;
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  });

  const error = registry.error ?? reply.error;
  const busy = !error && !reply.data;
  // While the next page loads, everything keeps the last answer (the list
  // only hidden), as the old page leaves it until the new one comes; an
  // error clears it.
  const results = error ? NOTHING : reply.data ?? reply.stale ?? NOTHING;
  // The filters of the last search answered (paint_chips): kept while the next
  // one loads, and when it fails.
  const [painted, setPainted] = useState({ data: null, filters: {} });
  if (reply.data && reply.data !== painted.data) setPainted({ data: reply.data, filters: query.filters });
  const start = (results.page - 1) * results.page_size;
  // The number the button shows: whichever answered last, a search or a count.
  // A failed count says plain Search; a failed search leaves it.
  // box: the count under the top box, from the same counts (paint_box_count),
  // while the box holds a search; a search answered clears it.
  const [total, setTotal] = useState({ reply: null, count: null, value: null, box: null });
  const counted = count.data ?? count.error;
  const boxed = searchable(panel?.values.q.trim() ?? "");
  if (reply.data && reply.data !== total.reply) setTotal({ ...total, reply: reply.data, value: reply.data.total, box: null });
  else if (counted && counted !== total.count) {
    setTotal({ ...total, count: counted, value: count.data?.total ?? null, box: boxed ? count.data : null });
  }
  const clearBox = () => setTotal({ ...total, box: null });

  // The top box typed in: under two letters its count goes at once.
  function onBox(name, value) {
    onValue(name, value);
    if (!searchable(value.trim())) clearBox();
  }
  // A name under the box picked: an organism, residue or ligand goes in its own
  // filter, the box emptied; anything else fills the box. Then it is searched.
  function onBoxPick(item) {
    if (item.href) {
      window.location.href = item.href;
      return;
    }
    clearBox();
    search({ page: 1 }, item.filter ? withValue(withValue(panel, "q", ""), item.filter, item.value) : withValue(panel, "q", item.value));
  }

  return (
    <div className="workspace">
      {/* A different answer, so back to its first page. */}
      {query && <TopSearch registry={registry.data} query={query} values={panel.values} onValue={onBox}
                           onMatch={(match) => search({ match, page: 1 })}
                           suggestPath={(text) => boxSuggestPath({ filters: filtersOf(panel), match: query.match }, text)}
                           onPick={onBoxPick}
                           count={total.box}
                           onSuggest={(s) => { clearBox(); search({ page: 1 }, withValue(panel, s.field, s.value)); }} />}
      {/* Chips of the search last answered; a removal searches the whole form. */}
      <ChipsBar chips={registry.data ? chipsOf(painted.filters, registry.data) : []}
                onRemove={(chip) => {
                  const { form, excluded } = withoutChip(panel, excludedOf(query.filters), registry.data, chip);
                  search({ page: 1 }, form, false, excluded);
                }} />
      <div className="workspace_body">
        <FilterPanel registry={registry.data} panel={panel} counts={counts.data} asked={asked}
                     open={query?.panelOpen ?? true} busy={busy} label={countLabel(total.value)}
                     onValue={onValue}
                     onFill={(name, value) => setEdited(withValue(panel, name, value))}
                     onPill={(key, value) => edit(withPill(panel, registry.data, key, value))}
                     onSubmit={() => search({ page: 1 })} />
        {/* A fold only goes in the address (set_panel): the page stays as it is. */}
        {query && <PanelHandle open={query.panelOpen} count={chipsOf(painted.filters, registry.data).length}
                               onToggle={() => search({ panelOpen: !query.panelOpen, page: results.page }, panel, true)} />}
        <div className="results_area">
          {/* A new order or page size is a new first page. A new layout redraws
              the page already here: the request leaves view out, so none is sent. */}
          {query && <ResultsHeader registry={registry.data} query={query}
                                   total={results.total} start={start} shown={results.results.length}
                                   onSort={(sort) => search({ sort, page: 1 })}
                                   onPerPage={(perPage) => search({ perPage, page: 1 })}
                                   onView={(view) => search({ view, page: results.page }, panel, true)} />}
          <SearchNote reply={error ? null : reply.data ?? reply.stale}
                      onPhrase={(phrase) => search({ page: 1 }, withValue(panel, "q", phrase))} />
          <div className="results_area_body">
            <ResultsList entries={results.results} view={query?.view ?? "cards"} hidden={busy} />
            <ResultsState busy={busy} error={error?.message} empty={!busy && !error && results.total === 0}
                          suggestions={results.suggestions ?? []}
                          hrefOf={(s) => suggestionHref(query, registry.data, s)}
                          onPick={(s) => search({ page: 1 }, withValue(panel, s.field, s.value))} />
          </div>
          <Pagination page={results.page} pages={results.pages}
                      onPage={(page) => search({ page })} />
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
