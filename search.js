// search.js - decides which entries match a set of filters.
// Server-side only. It never touches HTTP and it never touches the screen.

// Every filter the search accepts, split by how its value is shaped.
// The single source of truth for filter names on the server.
const TEXT_FILTERS = [
    "entry_id",
    "author_name",
    "confal_min",
    "confal_max",
    "assigned_ntc",
    "entity_name",
    "source_organism",
    "nonstandard_residue"
];

const PILL_FILTERS = [
    "experimental_method",
    "polymer_type",
    "monomer_flag"
];

// One raw query value as a single string, whatever shape it arrived in.
function as_text(value) {
    if (value === undefined) return "";
    if (Array.isArray(value)) return as_text(value[0]);
    return String(value);
}

// One raw query value as a list of chosen values.
// Accepts a comma-joined string, a repeated key, or nothing at all.
function as_list(value) {
    if (value === undefined) return [];

    let parts = Array.isArray(value) ? value : String(value).split(",");

    return parts.map(function (part) {
        return String(part).trim();
    }).filter(function (part) {
        return part !== "" && part !== "any";
    });
}

// Turns req.query into the filters object filter_entries expects.
// All eleven keys are always present, so nothing downstream can crash.
function query_to_filters(query) {
    let filters = {};

    TEXT_FILTERS.forEach(function (key) {
        filters[key] = as_text(query[key]);
    });

    PILL_FILTERS.forEach(function (key) {
        filters[key] = as_list(query[key]);
    });

    return filters;
}

// True if the entry's text contains the filter text. An empty filter box matches everything.
function text_matches(entry_value, filter_value) {
    if (filter_value === "") return true;
    if (!entry_value) return false;
    return entry_value.toLowerCase().includes(filter_value.toLowerCase());
}

// True if the entry's value is one of the selected pills. No pills selected matches everything.
function pill_matches(entry_value, selected) {
    if (selected.length === 0) return true;
    return selected.includes(entry_value);
}

// Runs every filter against one entry. It must survive all of them to come back true.
function matches(entry, f) {
    if (!text_matches(entry.pdb_id, f.entry_id)) return false;
    if (!text_matches(entry.author, f.author_name)) return false;
    if (!text_matches(entry.assigned_ntc, f.assigned_ntc)) return false;
    if (!text_matches(entry.entity_name, f.entity_name)) return false;
    if (!text_matches(entry.source_organism, f.source_organism)) return false;
    if (!text_matches(entry.nonstandard_residue, f.nonstandard_residue)) return false;

    if (!pill_matches(entry.method, f.experimental_method)) return false;
    if (!pill_matches(entry.polymer_type, f.polymer_type)) return false;
    if (!pill_matches(entry.monomer_flag, f.monomer_flag)) return false;

    // confal_score is null for every entry until DNATCO results are loaded,
    // so any confal filter can only exclude.
    if (f.confal_min !== "" || f.confal_max !== "") {
        if (entry.confal_score === null) return false;
        if (f.confal_min !== "" && entry.confal_score < Number(f.confal_min)) return false;
        if (f.confal_max !== "" && entry.confal_score > Number(f.confal_max)) return false;
    }

    return true;
}

// Keeps only the entries that pass matches(). This is what becomes a SQL WHERE clause later.
function filter_entries(all, f) {
    return all.filter(function (entry) {
        return matches(entry, f);
    });
}


// How many entries one page of results holds.
const PAGE_SIZE = 10;

// The most rows one export may return, so a single request cannot exhaust memory.
const EXPORT_LIMIT = 5000;

// The page number the caller asked for, or 1 if it is missing or nonsense.
function as_page(value) {
    let n = Math.floor(Number(as_text(value)));

    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

// Filters and sorts, which both the paged search and the full export need.
// One copy of this means a search and a report can never disagree.
function matching_entries(all, query) {
    let matching = filter_entries(all, query_to_filters(query));

    matching.sort(function (a, b) {
        return a.pdb_id.localeCompare(b.pdb_id);
    });

    return matching;
}

// The paged door into this file. Cuts one page out of the matching entries.
// Returns that page plus everything the caller needs to draw pagination.
export function search_entries(all, query) {
    let matching = matching_entries(all, query);
    let page = as_page(query.page);
    let start = (page - 1) * PAGE_SIZE;

    return {
        results: matching.slice(start, start + PAGE_SIZE),
        total: matching.length,
        page: page,
        pages: Math.ceil(matching.length / PAGE_SIZE),
        page_size: PAGE_SIZE
    };
}

// The unpaged door, for the report. Every matching entry, up to the limit.
// Says whether it had to stop early, so the page can warn the user.
export function export_entries(all, query) {
    let matching = matching_entries(all, query);

    return {
        results: matching.slice(0, EXPORT_LIMIT),
        total: matching.length,
        truncated: matching.length > EXPORT_LIMIT
    };
}


// Checks the query for things that cannot be answered.
// Returns a message describing the first problem found, or null if the query is fine.
export function query_problem(query) {
    let page = as_text(query.page);

    if (page !== "" && (!/^[0-9]+$/.test(page) || Number(page) < 1)) {
        return "page must be a whole number of 1 or more";
    }

    let min = as_text(query.confal_min);
    let max = as_text(query.confal_max);

    if (min !== "" && Number.isNaN(Number(min))) {
        return "confal_min must be a number";
    }

    if (max !== "" && Number.isNaN(Number(max))) {
        return "confal_max must be a number";
    }

    if (min !== "" && max !== "" && Number(min) > Number(max)) {
        return "confal_min cannot be higher than confal_max";
    }

    return null;
}