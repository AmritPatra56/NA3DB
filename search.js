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
    return "%" + String(text).replace(/[\\%_]/g, "\\$&") + "%";
}


// Per kind: was it filled in, and what goes into the ?. Three rules cover ten
// of the eleven filters. Lives here, not in the registry, because like_contains
// is an engine detail. A confal score of 0 is truthy and survives `active`.
const KINDS = {
    text:  { active: (v) => v !== "",     param: (v) => like_contains(v) },
    range: { active: (v) => v !== "",     param: (v) => Number(v) },
    pills: { active: (v) => v.length > 0, param: (v) => v }
};


export function build_where(query_params) {
    let f = query_to_filters(query_params);

    let where = ["TRUE"];
    let values = [];

    // Every ? in the clause becomes the number the value landed at, so a
    // clause and its value cannot drift apart.
    //
    // negate turns "AND <test>" into "AND NOT (<test>)". Safe for any clause
    // here because none of them can be null: EXISTS is always true or false,
    // and so is ILIKE against a column that cannot be null. So contains and
    // excludes always add up to the whole table.
    function add(clause, value, negate = false) {
        values.push(value);

        let sql = clause.replaceAll("?", "$" + values.length);

        where.push(negate
            ? "AND NOT (" + sql.replace(/^\s*AND\s+/, "") + ")"
            : sql);
    }

    for (const filter of FILTERS) {
        let value = f[filter.key];

        // A filter writing its own clause, with no parameter. null = inactive.
        if (filter.clause) {
            let sql = filter.clause(value);
            if (sql) where.push(sql);
            continue;
        }

        let rule = KINDS[filter.kind];
        if (!rule.active(value)) continue;

        // A negatable filter reads the query parameter it names: the search
        // box is inverted by ?match=excludes, and nothing else is negatable.
        let negate = filter.negatable &&
                     match_mode(as_text(query_params[filter.negatable])) === "excludes";

        add(filter.where, rule.param(value), negate);
    }

    return { where: where.join("\n    "), values };
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
    LEFT JOIN entity ent              ON ent.entry_id = e.id AND ent.id = '1'

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