import { useEffect, useEffectEvent, useState } from "react";
import { useApi } from "./useApi.js";
import { useCount } from "./useCount.js";
import { queryFromAddress, entriesPath, countPath, boxSuggestPath, addressOf, suggestionHref, excludedOf, askedValues, panelOpenOf } from "../searchQuery.js";
import { panelFromParams, filtersOfPanel, withValue, withPill } from "../panelForm.js";
import { chipsOf, withoutChip } from "../chips.js";
import { searchable } from "../query.js";
import { resultsOf, paintedOf, totalOf } from "../searchAnswer.js";
import { here, go, pushAddress, onHistory } from "../address.js";

// Into the address with a history entry, unless it already is that search;
// the rail's search link follows (sync_rail_links).
function toAddress(search, onAddress) {
  if (pushAddress(here().path + search)) onAddress(here().search);
}

// The search page's state (search.ejs, app.js), so SearchPage only wires its
// children. The search is read from the address, and every change is written
// back there (with a history entry, so Back works) as it is asked for.
// onAddress(search): the address changed, so the rail's link can carry it.
export function useSearch(onAddress) {
  // What the panel offers, from the same registry search.ejs is drawn from.
  const fields = useApi("/api/fields");
  const registry = fields.data;
  const counts = useApi("/api/pill_counts");
  // The search starts as the address says; after a change it is what was
  // chosen, and the address only follows it (as the old form is the search
  // and update_url writes it out): a link's odd sort stays "none" on page 2.
  const [chosen, setChosen] = useState(null);
  const query = chosen ?? (registry ? queryFromAddress(here().search, registry) : null);
  // Every search asks again, even one the same as the last (run_search).
  const [round, setRound] = useState(0);
  const reply = useApi(query ? entriesPath(query) : null, 0, round);
  // The panel's form (the top box is part of it), set from the address until
  // it is first changed. Every search is read from it, typed-in edits too.
  const [edited, setEdited] = useState(null);
  const panel = edited ?? (registry ? panelFromParams(new URLSearchParams(here().search), registry) : null);
  const [asked] = useState(() => askedValues(here().search));

  // The filters a form asks for (read_filters), with the not_ filters this
  // search keeps; only removing a chip changes those.
  const filtersOf = (form, excluded = excludedOf(query.filters)) => ({ ...filtersOfPanel(form, registry), ...excluded });
  const counter = useCount((form) => countPath({ filters: filtersOf(form), match: query.match }));

  // A changed search (update_url): into the address, then searched.
  // form: the form as this change leaves it. redraw: only a new layout, so the
  // address takes the form but nothing is asked again (as the old page does).
  function search(change, form = panel, redraw = false, excluded = undefined) {
    const next = { ...query, ...change, filters: filtersOf(form, excluded) };
    toAddress(addressOf(next, registry), onAddress);
    setEdited(form);
    setChosen(redraw ? { ...next, filters: query.filters } : next);
    if (!redraw) {
      setRound(round + 1);
      counter.drop();
    }
  }
  function edit(form) {
    setEdited(form);
    counter.ask(form);
  }

  // On load the address is written out as the search reads it, as run_search
  // does at once: an odd link (page=1, a sort the menu lacks) is tidied.
  useEffect(() => {
    if (registry) toAddress(addressOf(queryFromAddress(here().search, registry), registry), onAddress);
  }, [registry, onAddress]);

  // Back and Forward: the address has changed already, so the form is refilled
  // from it and searched again. The panel stays folded or open as it is, as
  // the old page leaves it, so the address may take panel=closed again.
  const back = useEffectEvent(() => {
    if (!registry) return;
    const was = queryFromAddress(here().search, registry);
    search({ ...was, panelOpen: query.panelOpen }, panelFromParams(new URLSearchParams(here().search), registry),
           false, excludedOf(was.filters));
  });
  useEffect(() => onHistory(back), []);

  const error = fields.error ?? reply.error;
  const results = resultsOf(reply, error);
  const total = totalOf(reply, counter.count, searchable(panel?.values.q.trim() ?? ""), counter.cleared);
  const withBox = (form) => {
    counter.clearBox();
    search({ page: 1 }, form);
  };

  return {
    registry, query, panel, asked, results, error, total,
    panelOpen: query?.panelOpen ?? panelOpenOf(here().search),
    counts: counts.data,
    busy: !error && !reply.data,
    note: error ? null : reply.data ?? reply.stale,
    chips: registry ? chipsOf(paintedOf(reply, registry), registry) : [],
    start: (results.page - 1) * results.page_size,
    search,
    getSuggestPath: (text) => boxSuggestPath({ filters: filtersOf(panel), match: query.match }, text),
    getHref: (s) => suggestionHref(query, registry, s),
    onValue: (name, value) => edit(withValue(panel, name, value)),
    onFill: (name, value) => setEdited(withValue(panel, name, value)),
    onPill: (key, value) => edit(withPill(panel, registry, key, value)),
    // The top box typed in: under two letters its count goes at once.
    onBox: (name, value) => {
      edit(withValue(panel, name, value));
      if (!searchable(value.trim())) counter.clearBox();
    },
    // A name under the box picked: an organism, residue or ligand goes in its
    // own filter, the box emptied; anything else fills the box. Then searched.
    onBoxPick: (item) => {
      if (item.href) go(item.href);
      else withBox(item.filter ? withValue(withValue(panel, "q", ""), item.filter, item.value) : withValue(panel, "q", item.value));
    },
    onBoxSuggest: (s) => withBox(withValue(panel, s.field, s.value)),
    // A chip removed searches the whole form.
    onRemove: (chip) => {
      const { form, excluded } = withoutChip(panel, excludedOf(query.filters), registry, chip);
      search({ page: 1 }, form, false, excluded);
    },
  };
}
