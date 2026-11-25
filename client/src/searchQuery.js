// The search as plain data: read from the address, turned into the request
// /api/entries understands (public/shared.js and app.js read_filters,
// search_entries). No component works this out itself.
//
// query: { filters, page, sort, perPage, match, view }
// filters: { [text filter]: "text", [pill filter]: [values], not_<key>: "text" }

import { panelFromParams, filtersOfPanel } from "./panelForm.js";

const NOT = "not_";
const VIEWS = ["cards", "lines", "grid"];

// The filters a query string asks for: the panel as the link sets it, plus
// not_<key>, which turns a filter round. The panel has no control for that, so
// it is kept as the address gives it.
export function filtersFromParams(params, registry) {
  const filters = filtersOfPanel(panelFromParams(params, registry), registry);
  for (const key of [...registry.text_filters, ...registry.pill_filters]) {
    const value = key === "q" ? null : params.get(NOT + key);
    if (value) filters[NOT + key] = value;
  }
  return filters;
}

// The not_<key> filters of a search, kept through every change to the panel.
export const excludedOf = (filters) => Object.fromEntries(Object.entries(filters).filter(([k]) => k.startsWith(NOT)));

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
