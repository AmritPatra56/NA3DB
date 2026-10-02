// search.js - decides which entries match a set of filters.
// Server-side only. It never touches HTTP and it never touches the screen.
// It does now talk to PostgreSQL, which is the only thing it depends on.

import { query } from "./db.js";

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

// Builds the WHERE clause for a search, and the values that go with it.
// Every value becomes a numbered placeholder — $1, $2 — so nothing a visitor
// types can ever be read as SQL.
//
// Only entry_id filters a column on `entry`. Everything else lives in another
// table, which is why the rest are EXISTS rather than plain comparisons.
// Wraps a value for a "contains" search, with the pattern characters escaped.
// In ILIKE, % means "any run of characters" and _ means "any one character".
// A search box promises to find what you typed, so a % the user types must
// stay a literal %. Backslash is ILIKE's escape character, so it goes first.
function like_contains(text) {
    return "%" + String(text).replace(/[\\%_]/g, "\\$&") + "%";
}


export function build_where(query_params) {
    let f = query_to_filters(query_params);

    let where = ["TRUE"];
    let values = [];

    // Adds one clause. The value goes on the list, and every ? in the clause
    // becomes the number it landed at. Written with ? because that is what
    // mysql2 uses; PostgreSQL wants $1, $2, so the conversion happens here.
    function add(clause, value) {
        values.push(value);
        where.push(clause.replaceAll("?", "$" + values.length));
    }

    // ILIKE is PostgreSQL's case-insensitive LIKE. Plain LIKE and = are
    // case-SENSITIVE here, unlike MySQL. The % go on in our code, so what
    // the visitor typed stays a value.
    if (f.entry_id) {
        add("AND e.id ILIKE ?", like_contains(f.entry_id));
    }

    if (f.author_name) {
        add(`AND EXISTS (SELECT 1 FROM citation_author ca
                         WHERE ca.entry_id = e.id
                           AND ca.citation_id = 'primary'
                           AND ca.name ILIKE ?)`, like_contains(f.author_name));
    }

    if (f.entity_name) {
        add(`AND EXISTS (SELECT 1 FROM entity ent
                         WHERE ent.entry_id = e.id
                           AND ent.pdbx_description ILIKE ?)`, like_contains(f.entity_name));
    }

    if (f.source_organism) {
        add(`AND EXISTS (SELECT 1 FROM entity_src_gen g
                         WHERE g.entry_id = e.id
                           AND g.pdbx_gene_src_scientific_name ILIKE ?)`,
            like_contains(f.source_organism));
    }

    // Searches the residue CODE as well as its name. Upstream checks only the
    // name, so typing "PSU" finds nothing there — and a code is what people type.
    //
    // The chem_comp lookup is wrapped in ARRAY(SELECT ...) rather than joined.
    // A join makes the subquery correlated — it mentions e.id — so PostgreSQL
    // re-runs the whole chem_comp scan once per entry: 1,489 x 33,146 rows.
    // ARRAY(SELECT ...) mentions nothing outside itself, so it becomes an
    // InitPlan and runs exactly once. 435 ms against 7 ms.
    if (f.nonstandard_residue) {
        add(`AND EXISTS (SELECT 1 FROM entity_poly_seq eps
                         WHERE eps.entry_id = e.id
                           AND eps.mon_id = ANY (ARRAY(
                               SELECT cc.id FROM chem_comp cc
                               WHERE cc.mon_nstd_flag = 'n'
                                 AND (cc.id ILIKE ? OR cc.name ILIKE ?))))`,
            like_contains(f.nonstandard_residue));
    }

    if (f.assigned_ntc) {
        add(`AND EXISTS (SELECT 1 FROM ndb_struct_ntc_step_summary ss
                         WHERE ss.entry_id = e.id
                           AND ss.assigned_ntc ILIKE ?)`, like_contains(f.assigned_ntc));
    }

    // A method IS a column, but on another table, so EXISTS as usual.
    // = ANY(?) takes the whole array as ONE parameter, however many pills
    // were clicked. With IN (...) the number of placeholders would change.
    if (f.experimental_method.length > 0) {
        add(`AND EXISTS (SELECT 1 FROM exptl x
                         WHERE x.entry_id = e.id AND x.method = ANY(?))`,
            f.experimental_method);
    }

    // Filters on the SAME expression the SELECT displays, so a result can
    // never disagree with the page it links to.
    if (f.polymer_type.length > 0) {
        add(`AND (${POLYMER_TYPE_SQL}) = ANY(?)`, f.polymer_type);
    }

    // Not `(CASE ... END) = ANY(?)` like polymer_type. Wrapping it in a CASE
    // forces PostgreSQL to evaluate the subquery for EVERY entry, because it
    // has to produce a value to compare. A bare EXISTS stops at the first
    // matching residue. With 3.8M rows in entity_poly_seq that is 750 ms
    // versus 20 ms. Selecting both pills is the same as selecting neither.
    // Reads the stored column. Selecting both pills is the same as neither.
    if (f.monomer_flag.length === 1) {
        if (f.monomer_flag[0] === "Non-Standard") {
            where.push("AND e.has_nonstandard_residue");
        } else if (f.monomer_flag[0] === "Standard") {
            where.push("AND NOT e.has_nonstandard_residue");
        }
    }

    // A range. An entry with no NtC row matches neither end, which is what
    // the JavaScript did with "if (entry.confal_score === null) return false".
    // Number() because a URL gives a string and PostgreSQL will not always
    // infer the type when comparing a REAL column against text.
    if (f.confal_min !== "") {
        add(`AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                         WHERE o.entry_id = e.id AND o.confal_score >= ?)`,
            Number(f.confal_min));
    }

    if (f.confal_max !== "") {
        add(`AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                         WHERE o.entry_id = e.id AND o.confal_score <= ?)`,
            Number(f.confal_max));
    }

    return { where: where.join("\n    "), values };
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

// One page of matching entries, plus the counts the screen needs to draw
// pagination. Two queries sent at the same time: one for the rows, one for
// the total. Two rather than one, because a page past the end returns no
// rows — and a count carried inside those rows would have nowhere to live.
export async function search_entries(query_params) {
    let { where, values } = build_where(query_params);
    let page = as_page(query_params.page);
    let offset = (page - 1) * PAGE_SIZE;

    let [rows, counted] = await Promise.all([
        // The ids are found first, then the columns are built for those ten.
        //
        // Done the obvious way — the columns in the same query as the LIMIT —
        // PostgreSQL computes all thirteen for every row up to the offset and
        // then discards them. Several of those columns are subqueries, so the
        // last page cost 1.7 seconds: 1,490 rows of work to return ten.
        //
        // LIMIT and OFFSET are written straight in, not parameterised. That is
        // safe because as_page guarantees a whole number, so offset can only
        // ever be digits. Everything from outside still goes in $1, $2.
        query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
               WHERE e.id IN (
                   SELECT e.id FROM entry e
                   WHERE ${where}
                   ORDER BY e.id
                   LIMIT ${PAGE_SIZE} OFFSET ${offset}
               )
               ORDER BY e.id`, values),

        query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values)
    ]);

    let total = Number(counted.rows[0].n);

    return {
        results:   rows.rows,
        total:     total,
        page:      page,
        pages:     Math.ceil(total / PAGE_SIZE),
        page_size: PAGE_SIZE
    };
}

// The unpaged door, for the report. Every matching entry, up to the limit.
// Says whether it had to stop early, so the page can warn the user.
export async function export_entries(query_params) {
    let { where, values } = build_where(query_params);

    let [rows, counted] = await Promise.all([
        query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
               WHERE ${where}
               ORDER BY e.id
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


// Three questions about what an entry contains, written once. They appear in
// the SELECT (to show the type) and in the WHERE (to filter on it), and they
// must be the same question in both places or a search can contradict a page.
const HAS_PROTEIN = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%polypeptide%')`;
const HAS_NA      = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%nucleotide%')`;
const HAS_SACC    = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%saccharide%')`;

const HAS_NONSTANDARD = `EXISTS (SELECT 1 FROM entity_poly_seq eps
                                 JOIN chem_comp cc ON cc.id = eps.mon_id
                                 WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n')`;

// Order matters. Protein/NA is tested first because such an entry also has a
// nucleic acid, and would otherwise stop at 'Nucleic acid'.
const POLYMER_TYPE_SQL = `CASE
        WHEN ${HAS_PROTEIN} AND ${HAS_NA}   THEN 'Protein/NA'
        WHEN ${HAS_PROTEIN} AND ${HAS_SACC} THEN 'Protein/Oligosaccharide'
        WHEN ${HAS_NA}                      THEN 'Nucleic acid'
        WHEN ${HAS_SACC}                    THEN 'Oligosaccharide'
        WHEN ${HAS_PROTEIN}                 THEN 'Protein'
        ELSE 'Other'
    END`;

const MONOMER_FLAG_SQL =
    `CASE WHEN ${HAS_NONSTANDARD} THEN 'Non-Standard' ELSE 'Standard' END`;


// The columns that make up one entry, gathered from the tables that hold them.
// LEFT JOIN, not JOIN: three entries have no resolution row and 52 have no
// organism row, and those must still come back — with null, not missing.
const ENTRY_COLUMNS = `
    e.id                                    AS pdb_id,
    s.title,
    -- A scalar subquery, not a join. citation_author has a generated id, so
    -- nothing stops two rows sharing (entry_id, citation_id, ordinal) — and a
    -- join on that would return the entry twice.
    (SELECT ca.name FROM citation_author ca
     WHERE ca.entry_id = e.id AND ca.citation_id = 'primary'
     ORDER BY ca.ordinal, ca.id LIMIT 1)      AS author,
    ex.method,
    rf.d_resolution_high                    AS resolution,
    ds.recvd_initial_deposition_date::text  AS deposition_date,
    ent.pdbx_description                    AS entity_name,
    -- Also a scalar subquery, and this one is not hypothetical: 18 entries
    -- have several entity_src_gen rows for entity 1 — usually the same
    -- organism recorded more than once. Joined, they turned 1,489 entries
    -- into 1,512 rows. COALESCE to '' because entries.json represents a
    -- missing organism that way.
    COALESCE((SELECT g.pdbx_gene_src_scientific_name FROM entity_src_gen g
              WHERE g.entry_id = e.id AND g.entity_id = '1'
              ORDER BY g.id LIMIT 1), '')     AS source_organism,

    -- Computed, not stored. The SAME expressions the WHERE clause filters on.
    ${POLYMER_TYPE_SQL} AS polymer_type,
    -- Reads the stored column rather than asking entity_poly_seq. See
    -- db/migrations/006 for why: 0.9 ms against 276 ms.
    CASE WHEN e.has_nonstandard_residue THEN 'Non-Standard' ELSE 'Standard' END
                                            AS monomer_flag,

    -- Many rows folded into the one comma-joined string the frontend expects.
    -- ORDER BY is not decoration: without it the order is not promised, and
    -- the same entry could come back differently on different days.
    COALESCE((
        SELECT string_agg(DISTINCT cc.id, ', ' ORDER BY cc.id)
        FROM entity_poly_seq eps
        JOIN chem_comp cc ON cc.id = eps.mon_id
        WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n'
    ), '') AS nonstandard_residue,

    -- Both of these are null for every entry until the DNATCO data is
    -- loaded. Expected, not a bug.
    ntc.confal_score,

    (SELECT string_agg(DISTINCT ss.assigned_ntc, ', ' ORDER BY ss.assigned_ntc)
     FROM ndb_struct_ntc_step_summary ss
     WHERE ss.entry_id = e.id) AS assigned_ntc
`;

const ENTRY_JOINS = `
    FROM entry e
    LEFT JOIN struct s                ON s.entry_id   = e.id
    LEFT JOIN exptl ex                ON ex.entry_id  = e.id
    LEFT JOIN reflns rf               ON rf.entry_id  = e.id
    LEFT JOIN pdbx_database_status ds ON ds.entry_id  = e.id
    LEFT JOIN entity ent              ON ent.entry_id = e.id AND ent.id = '1'

    LEFT JOIN ndb_struct_ntc_overall ntc ON ntc.entry_id = e.id
`;

// Finds one entry by its PDB id, case-insensitively, because 4tna and 4TNA
// are the same structure.
// Returns undefined when there is no such entry. What that *means* is the
// caller's problem — this file does not know what a 404 is.
// Extra columns for a single entry. Deliberately NOT part of ENTRY_COLUMNS:
// every one is a subquery, and a search returning ten rows should not pay for
// information only the detail view shows.
//
// This is what replaced the browser's call to data.rcsb.org. It gives more
// than RCSB did — every author rather than the first, the confal percentile
// and the NtC classes — because this database holds the DNATCO analysis.
const DETAIL_COLUMNS = `
    (SELECT string_agg(ca.name, ', ' ORDER BY ca.ordinal, ca.id)
     FROM citation_author ca
     WHERE ca.entry_id = e.id AND ca.citation_id = 'primary')     AS all_authors,

    (SELECT c.title FROM citation c
     WHERE c.entry_id = e.id AND c.id = 'primary')                AS citation_title,

    (SELECT trim(concat_ws(' ', c.journal_abbrev, c.year::text))
     FROM citation c
     WHERE c.entry_id = e.id AND c.id = 'primary')                AS published,

    (SELECT c.pdbx_database_id_doi FROM citation c
     WHERE c.entry_id = e.id AND c.id = 'primary')                AS doi,

    (SELECT c.pdbx_database_id_pubmed FROM citation c
     WHERE c.entry_id = e.id AND c.id = 'primary')                AS pubmed,

    (SELECT count(*) FROM entity_poly_seq s WHERE s.entry_id = e.id)::int  AS residue_count,
    (SELECT count(*) FROM struct_asym a    WHERE a.entry_id = e.id)::int   AS chain_count,
    (SELECT count(*) FROM entity n         WHERE n.entry_id = e.id)::int   AS entity_count,
    (SELECT count(*) FROM atom_site t      WHERE t.entry_id = e.id)::int   AS atom_count,

    ntc.confal_percentile,
    ntc.num_steps                                                  AS ntc_step_count,

    (SELECT string_agg(DISTINCT ss.assigned_ntc, ', ' ORDER BY ss.assigned_ntc)
     FROM ndb_struct_ntc_step_summary ss
     WHERE ss.entry_id = e.id AND ss.assigned_ntc <> 'NANT')       AS ntc_classes,

    (SELECT string_agg(DISTINCT ep.type, ', ' ORDER BY ep.type)
     FROM entity_poly ep WHERE ep.entry_id = e.id)                 AS polymer_composition
`;


export async function find_entry(id) {
    let result = await query(
        `SELECT ${ENTRY_COLUMNS}, ${DETAIL_COLUMNS} ${ENTRY_JOINS}
         WHERE UPPER(e.id) = UPPER($1)
         LIMIT 1`,
        [as_text(id).trim()]
    );

    return result.rows[0];
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