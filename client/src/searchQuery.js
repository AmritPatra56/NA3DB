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

function perPageFrom(asked, registry) {
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
  };
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
