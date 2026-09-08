// api.js - the pretend server.
// Downloads the data and decides which entries match a query.
// It cannot see the screen, so everything it needs is passed in as an argument.


// The downloaded entries, kept out here so the file is fetched only once per page load.
let entries_cache = null;


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

// Downloads entries.json on the first call and returns the stored copy on every call after.
async function load_entries() {
    if (entries_cache) return entries_cache;

    let res = await fetch("entries.json");

    if (!res.ok) {
        throw new Error(`Could not load the database (status ${res.status})`);
    }

    let data = await res.json();

    entries_cache = data;
    return data;
}

// The only door into this file: hand it the filters, get back the matching entries.
async function search_entries(filters) {
    let all = await load_entries();

    let min = filters.confal_min;
    let max = filters.confal_max;

    if (min !== "" && max !== "" && Number(min) > Number(max)) {
        throw new Error("Minimum confal score cannot be higher than the maximum");
    }

    return filter_entries(all, filters);
}

// Asks the real Protein Data Bank for one structure's full record. Not wired into the UI yet.
async function fetch_pdb_entry(pdb_id) {
    let res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdb_id}`);

    if (!res.ok) {
        throw new Error(`Entry ${pdb_id} could not be loaded (status ${res.status})`);
    }

    return await res.json();
}
