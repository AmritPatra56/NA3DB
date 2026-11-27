import { useEffect, useEffectEvent, useState } from "react";
import { useApi } from "./useApi.js";
import { useCount } from "./useCount.js";
import { queryFromAddress, entriesPath, countPath, boxSuggestPath, addressOf, suggestionHref, excludedOf, askedValues, panelOpenOf } from "../searchQuery.js";
import { panelFromParams, filtersOfPanel, withValue, withPill } from "../panelForm.js";
import { chipsOf, withoutChip } from "../chips.js";
import { searchable } from "../query.js";
import { resultsOf, paintedOf, totalOf } from "../searchAnswer.js";
import { here, go, pushAddress, onHistory } from "../address.js";

const toAddress = (search) => pushAddress(here().path + search);

export function useSearch() {
  const fields = useApi("/api/fields");
  const registry = fields.data;
  const counts = useApi("/api/pill_counts");
  const [chosen, setChosen] = useState(null);
  const query = chosen ?? (registry ? queryFromAddress(here().search, registry) : null);
  const [round, setRound] = useState(0);
  const reply = useApi(query ? entriesPath(query) : null, 0, round);
  const [edited, setEdited] = useState(null);
  const panel = edited ?? (registry ? panelFromParams(new URLSearchParams(here().search), registry) : null);
  const [asked] = useState(() => askedValues(here().search));

  const filtersOf = (form, excluded = excludedOf(query.filters)) => ({ ...filtersOfPanel(form, registry), ...excluded });
  const counter = useCount((form) => countPath({ filters: filtersOf(form), match: query.match }));

  function search(change, form = panel, redraw = false, excluded = undefined) {
    const next = { ...query, ...change, filters: filtersOf(form, excluded) };
    toAddress(addressOf(next, registry));
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

  useEffect(() => {
    if (registry) toAddress(addressOf(queryFromAddress(here().search, registry), registry));
  }, [registry]);

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
    onBox: (name, value) => {
      edit(withValue(panel, name, value));
      if (!searchable(value.trim())) counter.clearBox();
    },
    onBoxPick: (item) => {
      if (item.href) go(item.href);
      else withBox(item.filter ? withValue(withValue(panel, "q", ""), item.filter, item.value) : withValue(panel, "q", item.value));
    },
    onBoxSuggest: (s) => withBox(withValue(panel, s.field, s.value)),
    onRemove: (chip) => {
      const { form, excluded } = withoutChip(panel, excludedOf(query.filters), registry, chip);
      search({ page: 1 }, form, false, excluded);
    },
  };
}
