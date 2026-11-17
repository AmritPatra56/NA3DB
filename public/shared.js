// shared.js - what both pages need. Loaded before their own script.


// The filter names, injected by the server in the page above this script.
// filters.js already sorted them, so nothing is decided here.
let TEXT_FILTERS = REGISTRY.text_filters;
let PILL_FILTERS = REGISTRY.pill_filters;

// not_<key> turns one filter round: not_source_organism=Bacteria is every
// entry with no bacterial molecule. Set from the landing page; the panel has
// no control for it, so each page keeps the ones the URL asks, as text.
const NOT = "not_";
function excluded_in(params) {
    let out = {};
    [...TEXT_FILTERS, ...PILL_FILTERS].forEach(function (key) {
        let value = key === "q" ? null : params.get(NOT + key);
        if (value) out[NOT + key] = value;
    });
    return out;
}


// Makes one value safe for HTML. Needed on everything reaching innerHTML.
// & goes first or it re-escapes the replacements. Quotes are included because
// values also land in attributes, where a stray " would end one early.
function escape_html(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}


// A query string as a filters object. A parameter the URL omits becomes an
// empty value, not a missing key.
function params_to_filters(params) {
    let filters = {};

    TEXT_FILTERS.forEach(function (key) {
        let value = params.get(key);
        filters[key] = value === null ? "" : value;
    });

    PILL_FILTERS.forEach(function (key) {
        let value = params.get(key);
        filters[key] = value === null ? [] : value.split(",");
    });

    return Object.assign(filters, excluded_in(params));
}

// The filters object as a query string, leaving out anything left blank.
function filters_to_params(filters) {
    let params = new URLSearchParams();

    Object.keys(filters).forEach(function (key) {
        let value = filters[key];

        if (Array.isArray(value)) {
            if (value.length > 0) params.set(key, value.join(","));
        } else if (value !== "") {
            params.set(key, value);
        }
    });

    return params;
}


// Carries the current search into the rail links, so it survives a page move.
function sync_rail_links() {
    document.querySelectorAll(".rail-item[data-page]").forEach(function (link) {
        link.href = link.dataset.page + location.search;
    });
}
