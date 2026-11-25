// The search as plain data: read from the address, turned into the request
// /api/entries understands (public/shared.js and app.js read_filters,
// search_entries). No component works this out itself.
//
// query: { filters, page, sort, perPage, match, view }
// filters: { [text filter]: "text", [pill filter]: [values], not_<key>: "text" }

const NOT = "not_";
const VIEWS = ["cards", "lines", "grid"];

// What an <input type="number"> keeps of a value: a valid number or nothing.
const NUMBER = /^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/;

// The pill values the panel can show for one filter, in the order it draws
// them: the options, then the resolution bands. A value it has no pill for is
// dropped, as selecting pills on the old page drops it.
function pillValues(filter, asked) {
  const drawn = [...filter.options.filter((o) => !o.band), ...filter.options.filter((o) => o.band)];
  return drawn.map((o) => o.value).filter((v) => v !== "any" && asked.includes(v));
}

// The filters a query string asks for, as the panel would hold them.
export function filtersFromParams(params, registry) {
  const byKey = Object.fromEntries(registry.filters.map((f) => [f.key, f]));
  const filters = {};

  for (const key of registry.text_filters) {
    const value = (params.get(key) ?? "").trim();
    filters[key] = byKey[key].kind === "range" && !NUMBER.test(value) ? "" : value;
  }
  for (const key of registry.pill_filters) {
    const value = params.get(key);
    filters[key] = value === null ? [] : pillValues(byKey[key], value.split(","));
  }
  // not_<key> turns a filter round; the panel has no control for it, so it is
  // kept as the address gives it.
  for (const key of [...registry.text_filters, ...registry.pill_filters]) {
    const value = key === "q" ? null : params.get(NOT + key);
    if (value) filters[NOT + key] = value;
  }
  return filters;
}

// The filters as a query string, leaving out anything left blank.
export function filtersToParams(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
    } else if (value !== "") {
      params.set(key, value);
    }
  }
  return params;
}

// A page size as the box settles it (per_page_clamped): a whole number from 1
// to the most allowed, the default when it is no number at all.
export function perPageFrom(asked, registry) {
  const n = Math.floor(Number(asked));
  if (!Number.isFinite(n) || n < 1) return registry.default_page_size;
  return Math.min(n, registry.max_page_size);
}

// The whole search an address asks for. Anything it says that the page has no
// control for falls back to the default, so a hand-edited link still searches.
export function queryFromAddress(search, registry) {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const match = params.get("match");
  const view = params.get("view") === "arcs" ? "grid" : params.get("view");

  return {
    filters: filtersFromParams(params, registry),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    // A sort the menu does not offer leaves the menu empty, so none is sent.
    sort: registry.sorts.some((s) => s.key === params.get("sort")) ? params.get("sort")
        : params.get("sort") ? "" : registry.default_sort,
    perPage: perPageFrom(params.get("per_page"), registry),
    match: registry.match_modes.some((m) => m.key === match) ? match : registry.default_match,
    view: VIEWS.includes(view) ? view : "cards",
    panelOpen: params.get("panel") !== "closed",
  };
}

// The address for a search, as update_url writes it: only what differs from
// the defaults, so a plain search keeps a short link.
export function addressOf(query, registry) {
  const params = filtersToParams(query.filters);
  if (query.page > 1) params.set("page", query.page);
  if (query.sort !== registry.default_sort) params.set("sort", query.sort);
  if (!query.panelOpen) params.set("panel", "closed");
  if (query.view !== "cards") params.set("view", query.view);
  if (query.perPage !== registry.default_page_size) params.set("per_page", query.perPage);
  if (query.match !== registry.default_match) params.set("match", query.match);
  const search = params.toString();
  return search === "" ? "" : "?" + search;
}

// The request for one page of results, its parameters in search_entries' order.
export function entriesPath(query) {
  const params = filtersToParams(query.filters);
  if (query.page > 1) params.set("page", query.page);
  if (query.sort) params.set("sort", query.sort);
  params.set("per_page", query.perPage);
  params.set("match", query.match);
  return "/api/entries?" + params.toString();
}

// The link for one close search under No entries found (update_empty_state):
// this search's address with that field set and the page dropped. Only a
// ctrl-click or a new tab follows it; a plain click searches in place.
export function suggestionHref(query, registry, suggestion) {
  const params = new URLSearchParams(addressOf(query, registry));
  params.set(suggestion.field, suggestion.value);
  params.delete("page");
  return "/search?" + params.toString().replaceAll("+", "%20");
}

// The same search with one text filter set, from page 1: what picking a
// suggestion or the exact-phrase offer asks for.
export const withFilter = (query, key, value) => ({ ...query, filters: { ...query.filters, [key]: value }, page: 1 });
