// search.reference.mjs - the JavaScript filtering this project used before it
// moved to PostgreSQL, kept ONLY so the tests can check that the SQL gives the
// same answers. The application never imports this file.
//
// It is deliberately independent: it does its own query parsing rather than
// borrowing search.js's, so a bug there cannot hide in both places at once.

import entries from "./entries.json" with { type: "json" };

const TEXT = ["entry_id", "author_name", "confal_min", "confal_max", "assigned_ntc",
              "entity_name", "source_organism", "nonstandard_residue"];
const PILL = ["experimental_method", "polymer_type", "monomer_flag"];

function to_filters(q) {
    let f = {};
    for (const k of TEXT) f[k] = q[k] === undefined ? "" : String(q[k]);
    for (const k of PILL) {
        f[k] = q[k] === undefined ? []
             : String(q[k]).split(",").map((s) => s.trim())
                           .filter((s) => s !== "" && s !== "any");
    }
    return f;
}

function text_matches(value, filter) {
    if (filter === "") return true;
    if (!value) return false;
    return value.toLowerCase().includes(filter.toLowerCase());
}

function pill_matches(value, selected) {
    if (selected.length === 0) return true;
    return selected.includes(value);
}

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

    if (f.confal_min !== "" || f.confal_max !== "") {
        if (entry.confal_score === null) return false;
        if (f.confal_min !== "" && entry.confal_score < Number(f.confal_min)) return false;
        if (f.confal_max !== "" && entry.confal_score > Number(f.confal_max)) return false;
    }
    return true;
}

// Every matching pdb_id, in the order the old implementation produced.
export function reference_ids(query_params) {
    let f = to_filters(query_params);
    return entries.filter((e) => matches(e, f))
                  .map((e) => e.pdb_id)
                  .sort((a, b) => a.localeCompare(b));
}
