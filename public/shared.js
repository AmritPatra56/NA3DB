// shared.js - the things both pages need.
// Loaded by index.html and report.html, before their own script.


// Every filter the app has, split by how it is read from the form.
// This list is the single source of truth for the filter names.
let TEXT_FILTERS = [
    "entry_id",
    "author_name",
    "confal_min",
    "confal_max",
    "assigned_ntc",
    "entity_name",
    "source_organism",
    "nonstandard_residue"
];

let PILL_FILTERS = [
    "experimental_method",
    "polymer_type",
    "monomer_flag"
];


// Turns a query string into the filters object search_entries expects.
// A parameter that is not in the URL becomes an empty value, not a missing key.
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

    return filters;
}

// Turns the filters object into a query string, leaving out anything the user left blank.
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


// Keeps the current search in the rail links, so it survives moving between pages.
function sync_rail_links() {
    document.querySelectorAll(".rail-item[data-page]").forEach(function (link) {
        link.href = link.dataset.page + location.search;
    });
}
