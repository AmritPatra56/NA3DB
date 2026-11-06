// search.js - turns a set of filters into SQL and runs it.
// Server only. It never touches HTTP and never touches the screen.

import { query } from "./db.js";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, sort_by,
         page_size_from, match_mode } from "./filters.js";


// One raw query value as a single string, whatever shape it arrived in.
function as_text(value) {
    if (value === undefined) return "";
    if (Array.isArray(value)) return as_text(value[0]);
    return String(value);
}

// One raw query value as a list. Takes a comma-joined string, a repeated key,
// or nothing.
function as_list(value) {
    if (value === undefined) return [];

    let parts = Array.isArray(value) ? value : String(value).split(",");

    return parts.map(function (part) {
        return String(part).trim();
    }).filter(function (part) {
        return part !== "" && part !== "any";
    });
}

// req.query as a filters object. Every key is always present, so nothing
// downstream has to check.
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

// Wraps a value for a "contains" search with the pattern characters escaped,
// so a % or _ someone types stays literal. Backslash goes first.
function like_contains(text) {
    // Newlines come out first. The doc view separates its fields with one, so
    // a needle holding a newline could match across two of them -- reachable
    // from a URL as ?q=%0A even though no text input can type it.
    return "%" + String(text).replace(/[\r\n]+/g, " ").replace(/[\\%_]/g, "\\$&") + "%";
}

// The same value with punctuation dropped, for matching against prose that
// has been normalised the same way: typing "zdna" finds "Z-DNA".
//
// Spaces survive on purpose. Collapsing them too would run neighbouring words
// together, and "nt RNA" would become "ntrna" and answer a search for tRNA.
// Measured on the real data: dropping spaces turned 163 tRNA hits into 209,
// and all 46 extras were wrong.
function like_normalised(text) {
    let stripped = String(text)
        .toLowerCase()
        // Drops newlines along with the punctuation, which is what stops a
        // needle crossing the separator between two fields in the doc view.
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Nothing alphanumeric was typed, so there is nothing to match loosely. A
    // hyphen cannot survive normalisation on either side, so this pattern
    // matches nothing, which is what keeps a lone "%" finding nothing.
    if (stripped === "") return "%-%";

    // No escaping needed: % _ and \\ were just stripped.
    return "%" + stripped + "%";
}


// Per kind: was it filled in, and what goes into the ?. Three rules cover ten
// of the eleven filters. Lives here, not in the registry, because like_contains
// is an engine detail. A confal score of 0 is truthy and survives `active`.
const KINDS = {
    text:  { active: (v) => v !== "",     param: (v) => like_contains(v),
             normalised: (v) => like_normalised(v) },
    range: { active: (v) => v !== "",     param: (v) => Number(v) },
    pills: { active: (v) => v.length > 0, param: (v) => v }
};


export function build_where(query_params) {
    let f = query_to_filters(query_params);

    let tests = [];
    let values = [];

    // Every ? in the clause becomes the number the value landed at, so a
    // clause and its value cannot drift apart.
    // ? is the value. ?~ is the same value with its punctuation dropped, for
    // the branches matching against normalised prose. ?~ goes first, or the
    // bare ? would eat its question mark.
    function add(clause, value, normalised) {
        values.push(value);

        let sql = clause.replaceAll("?~", "\u0000").replaceAll("?", "$" + values.length);

        if (sql.includes("\u0000")) {
            values.push(normalised);
            sql = sql.replaceAll("\u0000", "$" + values.length);
        }

        tests.push(sql);
    }

    for (const filter of FILTERS) {
        let value = f[filter.key];

        // A filter writing its own clause, with no parameter. null = inactive.
        if (filter.clause) {
            let sql = filter.clause(value);
            if (sql) tests.push(sql);
            continue;
        }

        let rule = KINDS[filter.kind];
        if (!rule.active(value)) continue;

        add(filter.where, rule.param(value),
            rule.normalised && rule.normalised(value));
    }

    // Nothing was asked, so there is nothing to invert either: excluding
    // nothing leaves the whole table.
    if (tests.length === 0) return { where: "TRUE", values };

    // Each clause carries its own leading AND, which has to come off before
    // the search can be treated as one expression.
    let search = tests
        .map((sql) => sql.replace(/^\s*AND\s+/, ""))
        .join("\n    AND ");

    // "excludes" inverts the whole search, not each filter inside it. The
    // question it answers is "everything except what I just asked for", so
    // contains and excludes always add up to the whole table, whatever is in
    // the box and the panel together. Inverting filter by filter would not:
    // with two active, NOT(a) AND NOT(b) leaves every row matching exactly
    // one of them in neither half.
    //
    // NOT never yields null here because no clause can: they are EXISTS,
    // ILIKE against columns that cannot be null, and IS TRUE / IS NOT TRUE.
    if (match_mode(as_text(query_params.match)) === "excludes") {
        return { where: "NOT (\n    " + search + "\n)", values };
    }

    return { where: search, values };
}

// Cap on one export, so a single request cannot exhaust memory.
const EXPORT_LIMIT = 5000;

// The page number the caller asked for, or 1 if it is missing or nonsense.
function as_page(value) {
    let n = Math.floor(Number(as_text(value)));

    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

// One page of matching entries plus the counts for pagination. Two queries at
// once: a page past the end returns no rows, so the total needs its own.
export async function search_entries(query_params) {
    let { where, values } = build_where(query_params);
    let page = as_page(query_params.page);

    // Matched against a list rather than taken from the URL: it is written
    // straight into the LIMIT, so it can only ever be one of three numbers.
    let page_size = page_size_from(query_params.per_page);
    let offset = (page - 1) * page_size;

    // Looked up by key, so nothing from the URL is ever interpolated into the
    // ORDER BY. e.id last breaks ties, or a tied row could appear on two pages;
    // a column that is already unique does not need it.
    let sort = sort_by(as_text(query_params.sort));
    let order = sort.unique ? sort.sql : `${sort.sql}, e.id`;

    let [rows, counted] = await Promise.all([
        // Ids first, then the columns for those ten. With the columns in the
        // same query as the LIMIT, PostgreSQL builds all thirteen for every
        // row up to the offset and discards them: the last page cost 1.7 s.
        // LIMIT and OFFSET are inlined safely because as_page returns digits.
        query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
               WHERE e.id IN (
                   SELECT e.id FROM entry e
                   ${sort.join}
                   WHERE ${where}
                   ORDER BY ${order}
                   LIMIT ${page_size} OFFSET ${offset}
               )
               ORDER BY ${order}`, values),

        query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values)
    ]);

    let total = Number(counted.rows[0].n);

    return {
        results:   rows.rows,
        total:     total,
        page:      page,
        pages:     Math.ceil(total / page_size),
        page_size: page_size
    };
}

// How many entries match, without building a single row. Costs 6-45 ms where
// a full search costs 28-38, which is what makes a count-as-you-type possible.
export async function count_entries(query_params) {
    let { where, values } = build_where(query_params);
    let counted = await query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values);

    return Number(counted.rows[0].n);
}


// Every matching entry for the report, up to EXPORT_LIMIT. Says whether it
// stopped early so the page can warn.
export async function export_entries(query_params) {
    let { where, values } = build_where(query_params);

    // The same order the screen used, so a downloaded CSV matches what was on
    // it. No extra join: ENTRY_JOINS already has every table a sort needs.
    let sort = sort_by(as_text(query_params.sort));
    let order = sort.unique ? sort.sql : `${sort.sql}, e.id`;

    let [rows, counted] = await Promise.all([
        query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
               WHERE ${where}
               ORDER BY ${order}
               LIMIT ${EXPORT_LIMIT}`, values),

        query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values)
    ]);

    let total = Number(counted.rows[0].n);

    return {
        results:   rows.rows,
        total:     total,
        truncated: total > rows.rows.length
    };
}


// The SELECT list for one scope, built from the registry.
function columns_sql(scope) {
    return COLUMNS
        .filter((c) => c.scope === scope)
        .map((c) => `${c.select} AS ${c.key}`)
        .join(",\n    ");
}

// Every search result row.
const ENTRY_COLUMNS = columns_sql("entry");

// Extra columns for one entry. Each is a subquery, so a page of ten results
// must not pay for them.
const DETAIL_COLUMNS = columns_sql("detail");

// The tables those expressions read, and the aliases they use. LEFT JOIN, not
// JOIN: 3 entries have no resolution row and 52 no organism row.
const ENTRY_JOINS = `
    FROM entry e
    LEFT JOIN struct s                ON s.entry_id   = e.id
    LEFT JOIN exptl ex                ON ex.entry_id  = e.id
    LEFT JOIN reflns rf               ON rf.entry_id  = e.id
    LEFT JOIN pdbx_database_status ds ON ds.entry_id  = e.id

    LEFT JOIN ndb_struct_ntc_overall ntc ON ntc.entry_id = e.id
`;

// One entry by its PDB id, case-insensitively: 4tna and 4TNA are the same
// structure. undefined when there is none; this file does not know about 404s.
export async function find_entry(id) {
    let result = await query(
        `SELECT ${ENTRY_COLUMNS}, ${DETAIL_COLUMNS} ${ENTRY_JOINS}
         WHERE UPPER(e.id) = UPPER($1)
         LIMIT 1`,
        [as_text(id).trim()]
    );

    return result.rows[0];
}

// The first thing wrong with the query, or null if it is answerable.
// What an entity is, in the words a reader of a nucleic acid database uses.
// entity_poly.type when it is a polymer, entity.type otherwise.
const POLY_KINDS = {
    "polyribonucleotide":                                "RNA",
    "polydeoxyribonucleotide":                           "DNA",
    "polydeoxyribonucleotide/polyribonucleotide hybrid": "DNA/RNA hybrid",
    "polypeptide(L)":                                    "Protein",
    "polypeptide(D)":                                    "Protein",
    "polysaccharide(D)":                                 "Oligosaccharide",
    "polysaccharide(L)":                                 "Oligosaccharide"
};
const ENTITY_KINDS = { "non-polymer": "Ligand", "water": "Water", "branched": "Oligosaccharide" };

// Nucleic acids lead: in 786 entries entity 1 is a protein, and this is a
// nucleic acid database. Anything unrecognised sorts after the known kinds.
const KIND_ORDER = ["RNA", "DNA", "DNA/RNA hybrid", "Protein",
                    "Oligosaccharide", "Ligand", "Water", "Other"];

function entity_kind(entity_type, poly_type) {
    if (poly_type) return POLY_KINDS[poly_type] || "Other";
    return ENTITY_KINDS[entity_type] || "Other";
}

// Entity ids are numbers stored as text, so "10" would sort before "2".
function by_kind_then_id(a, b) {
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
        || a.id.length - b.id.length
        || a.id.localeCompare(b.id);
}

// Every molecule in one structure, with its chains, in one round trip.
// `q` lets a test run this inside its own transaction; the site uses query.
// Chain author ids come from pdbx_poly_seq_scheme, so ligands and water have
// none: the schema has no non-polymer scheme table.
export async function entry_contents(id, q = query) {
    let result = await q(
        `SELECT en.id, en.type, en.pdbx_description AS description,
                en.pdbx_number_of_molecules AS copies, en.formula_weight,
                ep.type AS poly_type,
                regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g') AS sequence,
                np.comp_id,
                COALESCE((
                    SELECT json_agg(json_build_object(
                               'label', a.id,
                               'auth', (SELECT min(s.pdb_strand_id)
                                          FROM pdbx_poly_seq_scheme s
                                         WHERE s.entry_id = a.entry_id AND s.asym_id = a.id))
                           ORDER BY length(a.id), a.id)
                      FROM struct_asym a
                     WHERE a.entry_id = en.entry_id AND a.entity_id = en.id
                ), '[]') AS chains
           FROM entry e
           JOIN entity en                ON en.entry_id = e.id
           LEFT JOIN entity_poly ep      ON ep.entry_id = en.entry_id AND ep.entity_id = en.id
           LEFT JOIN pdbx_entity_nonpoly np ON np.entry_id = en.entry_id AND np.entity_id = en.id
          WHERE UPPER(e.id) = UPPER($1)`,
        [as_text(id).trim()]
    );

    let entities = result.rows.map((row) => ({
        id:             row.id,
        kind:           entity_kind(row.type, row.poly_type),
        type:           row.type,
        poly_type:      row.poly_type,
        description:    row.description,
        copies:         row.copies,
        formula_weight: row.formula_weight,
        comp_id:        row.comp_id,
        sequence:       row.sequence || null,
        length:         row.sequence ? row.sequence.length : null,
        chains:         row.chains
    }));

    return { entities: entities.sort(by_kind_then_id) };
}

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