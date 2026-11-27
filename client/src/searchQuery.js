import { panelFromParams, filtersOfPanel } from "./panelForm.js";

const NOT = "not_";
const VIEWS = ["cards", "lines", "grid"];

export function filtersFromParams(params, registry) {
  const filters = filtersOfPanel(panelFromParams(params, registry), registry);
  for (const key of [...registry.text_filters, ...registry.pill_filters]) {
    const value = key === "q" ? null : params.get(NOT + key);
    if (value) filters[NOT + key] = value;
  }
  return filters;
}

export const filtersOfPath = (path, registry) =>
  filtersFromParams(new URLSearchParams(path.slice(path.indexOf("?") + 1)), registry);

export const askedValues = (search) => [...new URLSearchParams(search).values()].flatMap((v) => v.split(","));

export const excludedOf = (filters) => Object.fromEntries(Object.entries(filters).filter(([k]) => k.startsWith(NOT)));

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

export function perPageFrom(asked, registry) {
  const n = Math.floor(Number(asked));
  if (!Number.isFinite(n) || n < 1) return registry.default_page_size;
  return Math.min(n, registry.max_page_size);
}

export const panelOpenOf = (search) => new URLSearchParams(search).get("panel") !== "closed";

export function queryFromAddress(search, registry) {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const match = params.get("match");
  const view = params.get("view") === "arcs" ? "grid" : params.get("view");

  return {
    filters: filtersFromParams(params, registry),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: registry.sorts.some((s) => s.key === params.get("sort")) ? params.get("sort")
        : params.has("sort") ? "" : registry.default_sort,
    perPage: perPageFrom(params.get("per_page"), registry),
    match: registry.match_modes.some((m) => m.key === match) ? match : registry.default_match,
    view: VIEWS.includes(view) ? view : "cards",
    panelOpen: panelOpenOf(search),
  };
}

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

export function entriesPath(query) {
  const params = filtersToParams(query.filters);
  if (query.page > 1) params.set("page", query.page);
  if (query.sort) params.set("sort", query.sort);
  params.set("per_page", query.perPage);
  params.set("match", query.match);
  return "/api/entries?" + params.toString();
}

export function suggestionHref(query, registry, suggestion) {
  const params = new URLSearchParams(addressOf(query, registry));
  params.set(suggestion.field, suggestion.value);
  params.delete("page");
  return "/search?" + params.toString().replaceAll("+", "%20");
}

export function countPath(query) {
  const params = filtersToParams(query.filters);
  params.set("match", query.match);
  return "/api/count?" + params.toString();
}

export function boxSuggestPath(query, text) {
  const params = filtersToParams(query.filters);
  params.delete("q");
  params.set("match", query.match);
  params.set("q", text);
  return "/api/box_suggestions?" + params.toString();
}
