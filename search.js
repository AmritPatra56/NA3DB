import { readFileSync } from "node:fs";
import { query } from "./db.js";
import { dot_bracket_record } from "./detail.js";
import { clean_title, pdb_author } from "./cite.js";
import { sequence_key, compare_chains, best_rank } from "./sameseq.js";
import { taxa_named, taxa_exactly_named, taxon, is_common_name, lineage_of, name_key } from "./taxonomy.js";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, SOURCES_SQL, sort_by,
         page_size_from, match_mode, RESOLUTION_SQL, BROWSE, browse_row,
         REPORT_TABLES, report_fields, MOLECULE_COLUMNS, LIGAND_COLUMNS,
         modified_sql } from "./filters.js";

// PostgreSQL refuses NUL in text.
function as_text(value) {
    if (value === undefined) return "";
    if (Array.isArray(value)) return as_text(value[0]);
    return String(value).replaceAll("\u0000", "");
}

const SPELLED = {
    "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i",
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta",
    "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu",
    "ξ": "xi", "ο": "omicron", "π": "pi", "ρ": "rho", "σ": "sigma", "ς": "sigma", "τ": "tau",
    "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega"
};
const SPELLED_RE = new RegExp(`[${Object.keys(SPELLED).join("")}]`, "giu");

// The data is plain ASCII, so accents are folded. Curly quotes become straight.
export function clean_text(value) {
    return value
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033\u301D\u301E\uFF02]/g, "\"")
        .normalize("NFD").replace(/\p{M}/gu, "")
        .replace(SPELLED_RE, (ch) => {
            let lower = ch.toLowerCase(), spelled = SPELLED[lower];
            return ch === lower ? spelled : spelled[0].toUpperCase() + spelled.slice(1);
        })
        .replace(/\s+/g, " ")
        .replace(/[\x00-\x1f\x7f]/g, "")
        .trim();
}

function as_list(value) {
    if (value === undefined) return [];

    let parts = Array.isArray(value) ? value : String(value).split(",");

    return parts.map(function (part) {
        return String(part).replaceAll("\u0000", "").trim();
    }).filter(function (part) {
        return part !== "" && part !== "any";
    });
}

function query_to_filters(query) {
    let filters = {};

    TEXT_FILTERS.forEach(function (key) {
        filters[key] = clean_text(as_text(query[key]));
    });

    PILL_FILTERS.forEach(function (key) {
        filters[key] = as_list(query[key]);
    });

    return filters;
}

function like_contains(text) {
    // The doc view separates fields with newlines.
    return "%" + String(text).replace(/[\r\n]+/g, " ").replace(/[\\%_]/g, "\\$&") + "%";
}

// Spaces kept: "nt RNA" would become "ntrna" and match tRNA.
function like_normalised(text) {
    let stripped = String(text)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (stripped === "") return "%-%";

    return "%" + stripped + "%";
}

// Letters only: 1DNS is an id, not a plural.
export function singular(word) {
    if (word.length < 4 || !/^[a-z]+$/i.test(word)) return word;
    if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
    if (/(ch|sh|x|ss|z)es$/i.test(word)) return word.slice(0, -2);
    if (/[^su]s$/i.test(word)) return word.slice(0, -1);
    return word;
}

const MAX_UNITS = 12;

export function search_units(text) {
    let units = [];
    if ((text.match(/"/g) ?? []).length % 2 === 1) text += "\"";
    let rest = text.replace(/"([^"]*)"/g, (_, phrase) => {
        phrase = phrase.trim();
        if (phrase) units.push(Object.defineProperty([phrase], "exact", { value: true }));
        return " ";
    });
    let words = rest.replaceAll("\"", " ")
        .replace(/(^| )([b-hj-z])\.(?=[a-z]{2})/gi, "$1$2. ")   // e.coli -> e. coli
        .split(" ").filter(Boolean);

    for (let i = 0; i < words.length; i++) {
        let word = words[i], next = words[i + 1];
        // "E. coli" glues like "E coli".
        if (/^[b-hj-z]\.?$/i.test(word) && next) {
            let letter = word[0];
            units.push([`${letter} ${next}`, `${letter}${next}`, `${letter}-${next}`, `${next} ${letter}`]);
            i++;
            continue;
        }
        let one = singular(word);
        units.push(word.toLowerCase().startsWith(one.toLowerCase()) ? [one] : [word, one]);
    }

    return units.length > MAX_UNITS ? [[text]] : units;
}

export const is_exact = (unit) => unit.exact === true;

// Escaped for meaning; the value is a parameter.
const regex_literal = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

// A newline does not separate words, so a phrase cannot span two fields.
export function exact_pattern(phrase) {
    let words = phrase.split(/[\s-]+/).filter(Boolean);
    if (words.length === 0) return null;
    return "(^|[^[:alnum:]])" + words.map(regex_literal).join("[[:blank:]-]+") + "([^[:alnum:]]|$)";
}

const NAME_WORD = /^[a-z][a-z'-]*\.?$/i;

export function author_form(text) {
    let words = text.replaceAll("\"", " ").split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 3 || !words.every((w) => NAME_WORD.test(w))) return null;

    let family = words.at(-1);
    if (family.endsWith(".") || family.length < 2) return null;

    let given = words.slice(0, -1).map((w) => w.replace(/\.$/, ""));
    let [first, ...middle] = given;
    let initial = first[0];

    let pattern = "(^|\n)" + regex_literal(family) + ",[[:blank:]]*"
        + (first.length > 1 ? `(${regex_literal(initial)}\\.|${regex_literal(first)}\\M)`
                            : `${regex_literal(initial)}(\\.|\\M)`)
        + middle.map((m) => `[[:blank:]-]*${regex_literal(m[0])}(\\.|\\M)`).join("");

    let shown = `${family}, ${[initial, ...middle.map((m) => m[0])].map((c) => c.toUpperCase() + ".").join("")}`;
    return { pattern, family, shown };
}

const KINDS = {
    text:  { active: (v) => v !== "",     param: (v) => like_contains(v),
             normalised: (v) => like_normalised(v) },
    range: { active: (v) => v !== "",     param: (v) => Number(v) },
    // Anything else matches nothing rather than reaching PostgreSQL as NaN.
    number: { active: (v) => v !== "",    param: (v) => (/^\s*\d{1,9}\s*$/.test(v) ? Number(v) : -1) },
    pills: { active: (v) => v.length > 0, param: (v) => v }
};

const text_param_of = (filter, rule, value) =>
    filter.common_name_is_taxon && is_common_name(value) ? null : rule.param(value);

export const NOT = "not_";

export function build_where(query_params) {
    let f = query_to_filters(query_params);

    let tests = [];
    let values = [];

    // ?~ and ?@ first, or the bare ? would take their question marks.
    function bind(clause, value, normalised, typed) {
        values.push(value);

        let sql = clause.replaceAll("?~", "\u0000").replaceAll("?@", "\u0001")
                        .replaceAll("?", "$" + values.length);

        if (sql.includes("\u0000")) {
            values.push(normalised);
            sql = sql.replaceAll("\u0000", "$" + values.length);
        }
        if (sql.includes("\u0001")) {
            values.push(taxa_named(typed));
            sql = sql.replaceAll("\u0001", "$" + values.length + "::int[]");
        }

        return sql;
    }
    const add = (clause, value, normalised, typed) => tests.push(bind(clause, value, normalised, typed));
    const param = (value) => { values.push(value); return "$" + values.length; };

    const author_clause = (name) =>
        `EXISTS (SELECT 1 FROM doc d WHERE d.id = e.id
                    AND d.prose LIKE ${param(like_normalised(name.family))}
                    AND d.authors ~* ${param(name.pattern)})`;

    const exact_clause = (phrase) => {
        let pattern = exact_pattern(phrase);
        if (!pattern) return "FALSE";

        let narrow = phrase.split(/[\s-]+/).filter(Boolean).map((word) => {
            let loose = param(like_contains(word));
            return `(d.prose LIKE ${param(like_normalised(word))} OR d.id ILIKE ${loose}
                     OR d.entities ILIKE ${loose} OR d.residues ILIKE ${loose})`;
        }).join(" AND ");

        let re = param(pattern);
        let found = [`EXISTS (SELECT 1 FROM doc d WHERE d.id = e.id AND ${narrow}
                    AND (d.id ~* ${re} OR d.title ~* ${re} OR d.entities ~* ${re}
                         OR d.authors ~* ${re} OR d.organisms ~* ${re} OR d.residues ~* ${re}))`];

        let taxa = taxa_exactly_named(phrase);
        if (taxa.length) {
            found.push(`e.id IN (SELECT s.entry_id FROM ${SOURCES_SQL} s WHERE s.taxid = ANY(${param(taxa)}::int[]))`);
        }

        let name = author_form(phrase);
        if (name) found.push(author_clause(name));

        return `(${found.join("\n      OR ")})`;
    };

    // COALESCE: an entry the clause cannot judge counts as not matching.
    let excluded = query_to_filters(Object.fromEntries(Object.entries(query_params)
        .filter(([k]) => k.startsWith(NOT) && k !== NOT + "q").map(([k, v]) => [k.slice(NOT.length), v])));
    let asked = [...FILTERS.map((filter) => ({ filter, value: f[filter.key], not: false })),
                 ...FILTERS.map((filter) => ({ filter, value: excluded[filter.key], not: true }))];

    let turning = null;
    const turn = () => {
        if (turning === null) return;
        let own = tests.splice(turning).map((sql) => sql.replace(/^\s*AND\s+/, ""));
        if (own.length) tests.push(`AND NOT COALESCE((${own.join("\n    AND ")}), FALSE)`);
        turning = null;
    };

    for (const { filter, value: asked_value, not } of asked) {
        turn();
        if (not) turning = tests.length;
        let value = asked_value;

        if (filter.words) {
            let clauses = search_units(value).map((unit) => {
                if (is_exact(unit)) return exact_clause(unit[0]);
                let either = unit.map((spelling) =>
                    bind(filter.where, like_contains(spelling), like_normalised(spelling), spelling)
                        .replace(/^\s*AND\s+/, ""));
                return `(${either.join("\n         OR ")})`;
            });
            if (clauses.length === 0) continue;

            let name = value.includes("\"") ? null : author_form(value);
            let all = clauses.join("\n     AND ");
            tests.push(name ? `AND ((${all})\n     OR ${author_clause(name)})` : `AND ${all}`);
            continue;
        }

        if (filter.clause) {
            let sql = filter.clause(value);
            if (sql) tests.push(sql);
            continue;
        }

        let rule = KINDS[filter.kind];
        if (!rule.active(value)) continue;

        if (filter.expand) value = filter.expand(value);

        if (filter.max_length && value.trim().length > filter.max_length) {
            tests.push("AND FALSE");
            continue;
        }

        if (filter.each_word) {
            let words = value.split(/[\s,]+/).filter(Boolean);
            add(filter.where, (words.length ? words : [value]).map(like_contains));
            continue;
        }

        let is_part = filter.code_list ? (p) => /^[A-Za-z0-9]{1,5}$/.test(p)
                    : filter.taxon_list ? (p) => taxa_named(p).length > 0
                    : null;
        if (is_part) {
            let parts = value.split(",").map((p) => p.trim());
            if (parts.length > 1 && parts.every(is_part)) {
                let either = parts.map((p) => bind(filter.where, text_param_of(filter, rule, p),
                                                   rule.normalised && rule.normalised(p), p)
                                              .replace(/^\s*AND\s+/, ""));
                tests.push(`AND (${either.join("\n         OR ")})`);
                continue;
            }
        }

        add(filter.where, text_param_of(filter, rule, value), rule.normalised && rule.normalised(value), value);
    }
    turn();

    if (tests.length === 0) return { where: "TRUE", values };

    let search = tests
        .map((sql) => sql.replace(/^\s*AND\s+/, ""))
        .join("\n    AND ");

    // Inverts the whole search, so contains and excludes add up to the whole table.
    if (match_mode(as_text(query_params.match)) === "excludes") {
        return { where: "NOT (\n    " + search + "\n)", values };
    }

    return { where: search, values };
}

// Rank 0: phrase and whole words; 1: phrase, partial words; 2: words apart, whole; 3: words apart, partial.
function best_match(query_params, offset, sort) {
    let text = clean_text(as_text(query_params.q));
    let units = text ? search_units(text) : [];
    if (!sort.ranked || units.length === 0) {
        return { order: sort.unique ? sort.sql : `${sort.sql}, e.id`, values: [] };
    }

    let values = [];
    let p = (v) => { values.push(v); return "$" + (offset + values.length); };

    let phrase = text.replaceAll("\"", " ").replace(/\s+/g, " ").trim();
    let has_phrase = `(d.prose LIKE ${p(like_normalised(phrase))} OR d.entities ILIKE ${p(like_contains(phrase))})`;

    let whole = units.map((unit) => {
        let spellings = [...new Set(unit.map((s) => like_normalised(s).slice(1, -1)).filter((s) => s && s !== "-"))];
        if (spellings.length === 0) return "TRUE";
        let re = p(`(^|[^a-z0-9])(${spellings.join("|")})(s|es)?([^a-z0-9]|$)`);
        return `(d.prose ~ ${re} OR lower(coalesce(d.title, '')) ~ ${re}
                 OR lower(coalesce(d.entities, '')) ~ ${re} OR lower(coalesce(d.residues, '')) ~ ${re})`;
    }).join(" AND ");

    let rank = `(SELECT CASE WHEN ${has_phrase} THEN 0 ELSE 2 END
                      + CASE WHEN ${whole} THEN 0 ELSE 1 END
                   FROM doc d WHERE d.id = e.id)`;
    return { order: `${rank}, e.id`, values };
}

const EXPORT_LIMIT = 5000;

function as_page(value) {
    let n = Math.floor(Number(as_text(value)));

    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

export async function search_entries(query_params) {
    let { where, values } = build_where(query_params);
    let page = as_page(query_params.page);

    // Written straight into LIMIT, so only one of three numbers.
    let page_size = page_size_from(query_params.per_page);
    let offset = (page - 1) * page_size;

    let sort = sort_by(as_text(query_params.sort));
    let { order, values: ranking } = best_match(query_params, values.length, sort);

    let [rows, counted] = await Promise.all([
        // Ids first: with the columns in the same query the last page took 1.7 s.
        query(`SELECT ${ENTRY_COLUMNS} ${ENTRY_JOINS}
               WHERE e.id IN (
                   SELECT e.id FROM entry e
                   ${sort.join}
                   WHERE ${where}
                   ORDER BY ${order}
                   LIMIT ${page_size} OFFSET ${offset}
               )
               ORDER BY ${order}`, [...values, ...ranking]),

        query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values)
    ]);

    let total = Number(counted.rows[0].n);

    return {
        results:   rows.rows,
        total:     total,
        page:      page,
        pages:     Math.ceil(total / page_size),
        page_size: page_size,
        ...await how_read(query_params)
    };
}

async function how_read(query_params) {
    let text = clean_text(as_text(query_params.q));
    let units = text ? search_units(text) : [];
    return {
        exact:     units.some(is_exact),
        phrase:    !text.includes("\"") && units.length >= 2 ? `"${text}"` : null,
        stored_as: await stored_names(text)
    };
}

async function stored_names(text) {
    if (!text) return [];

    let names = text.includes("\"")
        ? search_units(text).filter(is_exact).map((unit) => author_form(unit[0]))
        : [author_form(text)];
    names = names.filter(Boolean);
    if (names.length === 0) return [];

    let found = await query(`SELECT n.shown FROM unnest($1::text[], $2::text[], $3::text[]) AS n(shown, family, pattern)
                              WHERE EXISTS (SELECT 1 FROM doc d WHERE d.prose LIKE n.family AND d.authors ~* n.pattern)`,
                            [names.map((n) => n.shown), names.map((n) => like_normalised(n.family)), names.map((n) => n.pattern)]);
    return found.rows.map((r) => r.shown);
}

export async function database_stats() {
    let result = await query(`SELECT (SELECT count(*) FROM entry) AS total,
                                     (SELECT max(loaded_at) FROM loaded_entries) AS updated`);
    let row = result.rows[0];
    return { total: Number(row.total), updated: row.updated };
}

export async function count_entries(query_params) {
    let { where, values } = build_where(query_params);
    let counted = await query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values);

    return Number(counted.rows[0].n);
}

const BROWSE_TTL_MS = 10 * 60 * 1000;
export const BROWSE_TOP = 10;
const TOP_SOURCES = { ligand: ligand_suggestions, nonstandard_residue: nonstandard_suggestions };
let browse_cache = null;

const counted = (rows) => Promise.all(rows.map(async (row) => ({ ...row, count: await count_entries(row.params) })));
function with_share(rows) {
    let most = Math.max(...rows.map((r) => r.count), 1);
    return rows.map((r) => ({ ...r, share: r.count / most }));
}

export function kingdom_organisms(organisms, within, n = BROWSE_TOP) {
    let chosen = [];
    for (const o of organisms) {
        let lineage = lineage_of(o.code);
        if (!lineage.includes(name_key(within))) continue;
        if (lineage.some((l) => l.startsWith("unclassified ") || l === "environmental samples")) continue;
        if (chosen.some((c) => lineage.includes(name_key(c.code)))) continue;
        chosen.push(o);
        if (chosen.length === n) break;
    }
    return chosen;
}

async function options_of(row) {
    if (row.within) {
        let chosen = kingdom_organisms(await organism_suggestions("source_organisms"), row.within);
        return chosen.map((o) => browse_row(o.code, "source_organism", [o.code], o.name.split(", ")[0] || null));
    }
    if (row.top) {
        let codes = (await TOP_SOURCES[row.top]()).slice(0, BROWSE_TOP);
        return codes.map((c) => browse_row(c.code, row.top, [c.code], c.name));
    }
    return row.choices ?? [];
}

export async function browse_counts() {
    if (browse_cache && Date.now() - browse_cache.at < BROWSE_TTL_MS) return browse_cache.groups;

    let groups = await Promise.all(BROWSE.map(async (group) => ({
        ...group,
        rows: with_share(await Promise.all(group.rows.map(async (row) => ({
            ...row,
            count: await count_entries(row.params),
            options: with_share(await counted(await options_of(row)))
        }))))
    })));
    browse_cache = { at: Date.now(), groups };
    return groups;
}

export async function export_entries(query_params) {
    let { where, values } = build_where(query_params);

    let sort = sort_by(as_text(query_params.sort));
    let { order, values: ranking } = best_match(query_params, values.length, sort);

    let [rows, counted] = await Promise.all([
        query(`SELECT ${STRUCTURE_COLUMNS} ${ENTRY_JOINS}
               WHERE ${where}
               ORDER BY ${order}
               LIMIT ${EXPORT_LIMIT}`, [...values, ...ranking]),

        query(`SELECT count(*) AS n FROM entry e WHERE ${where}`, values)
    ]);

    let total = Number(counted.rows[0].n);

    return {
        results:   rows.rows,
        total:     total,
        truncated: total > rows.rows.length
    };
}

async function export_ids(query_params, q) {
    let { where, values } = build_where(query_params);
    let sort = sort_by(as_text(query_params.sort));
    let { order, values: ranking } = best_match(query_params, values.length, sort);

    return (await q(`SELECT e.id ${ENTRY_JOINS}
                         WHERE ${where}
                         ORDER BY ${order}
                         LIMIT ${EXPORT_LIMIT}`, [...values, ...ranking])).rows.map((r) => r.id);
}

export async function export_molecules(query_params, q = query) {
    let ids = await export_ids(query_params, q);

    let proteins = as_text(query_params.proteins) === "1";
    let rows = await q(
        `SELECT ${MOLECULE_COLUMNS.map((c) => `${c.select} AS ${c.key}`).join(",\n    ")}
           FROM entity_poly ep
           JOIN entity en ON en.entry_id = ep.entry_id AND en.id = ep.entity_id
           LEFT JOIN (${modified_sql(!proteins)}) mods ON mods.entry_id = ep.entry_id AND mods.entity_id = ep.entity_id
          WHERE ep.entry_id = ANY($1)
            ${proteins ? "" : "AND ep.type ILIKE '%nucleotide%'"}
          ORDER BY array_position($1, ep.entry_id),
                   ep.type NOT ILIKE '%nucleotide%',
                   length(ep.entity_id), ep.entity_id`,
        [ids]);

    return { results: rows.rows, total: rows.rows.length, entries: ids.length, proteins };
}

export async function export_ligands(query_params, q = query) {
    let ids = await export_ids(query_params, q);
    let water = as_text(query_params.water) === "1";

    let rows = await q(
        `SELECT ${LIGAND_COLUMNS.map((c) => `${c.select} AS ${c.key}`).join(",\n    ")}
           FROM pdbx_entity_nonpoly n
           JOIN entity en ON en.entry_id = n.entry_id AND en.id = n.entity_id
           JOIN chem_comp cc ON cc.id = n.comp_id
          WHERE n.entry_id = ANY($1)
            ${water ? "" : "AND n.comp_id <> 'HOH'"}
          ORDER BY array_position($1, n.entry_id), length(n.entity_id), n.entity_id`,
        [ids]);

    return { results: rows.rows, total: rows.rows.length, entries: ids.length, water };
}

export async function export_dot_brackets(query_params, q = query) {
    let ids = await export_ids(query_params, q);

    let chains = (await q(
        `SELECT a.entry_id, a.id AS asym,
                (SELECT s.pdb_strand_id FROM pdbx_poly_seq_scheme s
                  WHERE s.asym_id = a.id AND s.entry_id = a.entry_id LIMIT 1) AS auth,
                regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g') AS sequence
           FROM struct_asym a
           JOIN entity_poly ep ON ep.entry_id = a.entry_id AND ep.entity_id = a.entity_id
          WHERE a.entry_id = ANY($1) AND ep.type ILIKE '%nucleotide%'
          ORDER BY array_position($1, a.entry_id), length(ep.entity_id), ep.entity_id,
                   length(a.id), a.id`, [ids])).rows;

    // Joined in JS: the planner looped over 370,000 pairs and took 16 s.
    let cww = new Set((await q(
        `SELECT entry_id || ' ' || base_pair_id AS k FROM ndb_base_pair_annotation
          WHERE entry_id = ANY($1) AND lw_family = 'cWW'`, [ids])).rows.map((r) => r.k));

    let listed = (await q(
        `SELECT concat_ws(' ', entry_id, base_pair_id, coalesce(pdb_model_number, 1),
                          asym_id_1, seq_id_1, comp_id_1, asym_id_2, seq_id_2, comp_id_2) AS r
           FROM ndb_base_pair_list
          WHERE entry_id = ANY($1)
            AND COALESCE(struct_oper_id_1, '1') = '1' AND COALESCE(struct_oper_id_2, '1') = '1'`,
        [ids])).rows.flatMap(({ r }) => {
            let [entry_id, base_pair_id, model, asym_1, pos_1, comp_id_1, asym_2, pos_2, comp_id_2] = r.split(" ");
            return cww.has(`${entry_id} ${base_pair_id}`)
                ? [{ entry_id, model: +model, asym_1, pos_1: +pos_1, comp_id_1, asym_2, pos_2: +pos_2, comp_id_2 }]
                : [];
        });

    // By the parent base, so PSU pairs as U.
    let parent = new Map((await q(`SELECT id, parent_comp_id FROM chem_comp WHERE parent_comp_id IS NOT NULL`)).rows
        .map((r) => [r.id, r.parent_comp_id]));
    let base = (comp) => (parent.get(comp) ?? comp).replace(/^D(?=[ACGTU]$)/, "").replace("T", "U");

    let first = new Map();
    for (const p of listed) first.set(p.entry_id, Math.min(first.get(p.entry_id) ?? Infinity, p.model));
    let annotated = new Set((await q(
        `SELECT DISTINCT entry_id FROM ndb_base_pair_list WHERE entry_id = ANY($1)`, [ids])).rows
        .map((r) => r.entry_id));

    let pairs = listed.filter((p) => p.model === first.get(p.entry_id) &&
                                     ["AU", "CG", "GU"].includes([base(p.comp_id_1), base(p.comp_id_2)].sort().join("")));

    let by_entry = (rows) => Map.groupBy(rows, (r) => r.entry_id);
    let chains_of = by_entry(chains);
    let pairs_of = by_entry(pairs);
    let records = [];
    let unannotated = [];

    for (const id of ids) {
        if (!chains_of.has(id)) continue;
        if (!annotated.has(id)) { unannotated.push(id); continue; }
        records.push(dot_bracket_record(id, chains_of.get(id), pairs_of.get(id) ?? []));
    }

    return { text: records.join(""), records: records.length, unannotated };
}

function columns_sql(scope) {
    return COLUMNS
        .filter((c) => c.scope === scope)
        .map((c) => `${c.select} AS ${c.key}`)
        .join(",\n    ");
}

const ENTRY_COLUMNS = columns_sql("entry");

const STRUCTURE_COLUMNS = report_fields(REPORT_TABLES.find((t) => t.key === "structures"))
    .map(({ key }) => {
        let c = COLUMNS.find((col) => col.key === key);
        let back = c.fallback && COLUMNS.find((col) => col.key === c.fallback);
        let select = c.report_select ?? c.select;
        return `${back ? `COALESCE(${select}, ${back.select})` : select} AS ${key}`;
    })
    .join(",\n    ");

const DETAIL_COLUMNS = columns_sql("detail");

// LEFT JOIN: 52 entries have no organism row.
const ENTRY_JOINS = `
    FROM entry e
    LEFT JOIN struct s                ON s.entry_id   = e.id
    LEFT JOIN exptl ex                ON ex.entry_id  = e.id
    LEFT JOIN pdbx_database_status ds ON ds.entry_id  = e.id

    LEFT JOIN ndb_struct_ntc_overall ntc ON ntc.entry_id = e.id
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

// Nucleic acids first: in 786 entries entity 1 is a protein.
const KIND_ORDER = ["RNA", "DNA", "DNA/RNA hybrid", "Protein",
                    "Oligosaccharide", "Ligand", "Water", "Other"];

function entity_kind(entity_type, poly_type) {
    if (poly_type) return POLY_KINDS[poly_type] || "Other";
    return ENTITY_KINDS[entity_type] || "Other";
}

// Entity ids are text, so "10" would sort before "2".
function by_kind_then_id(a, b) {
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
        || a.id.length - b.id.length
        || a.id.localeCompare(b.id);
}

// Ligands and water have no author chain id: the schema has no non-polymer scheme.
const blank = (v) => (v && v.trim()) || null;

export function source_of(rows) {
    if (!rows.length) return null;
    let segments = rows.map((r) => ({ organism: blank(r.organism), taxid: r.taxid ?? null,
                                      from: r.beg ?? null, to: r.fin ?? null,
                                      common_name: blank(r.common), strain: blank(r.strain),
                                      gene: blank(r.gene), cell_line: blank(r.cell_line),
                                      details: blank(r.details) }));
    let host = rows.find((r) => blank(r.host) || r.host_taxid);
    let hosted = host && !segments.every((s) => s.taxid && s.taxid === host.host_taxid)
               ? { organism: blank(host.host), taxid: host.host_taxid ?? null } : null;
    return { kind: rows[0].kind, segments: segments.length > 1 ? segments
                                         : [{ ...segments[0], from: null, to: null }],
             host: hosted };
}

export async function entry_contents(id, q = query) {
    let result = await q(
        `SELECT en.id, en.type, en.pdbx_description AS description,
                en.pdbx_number_of_molecules AS copies, en.formula_weight,
                ep.type AS poly_type,
                regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g') AS sequence,
                np.comp_id,
                COALESCE((
                    SELECT json_agg(json_build_object('label', a.id)
                                    ORDER BY length(a.id), a.id)
                      FROM struct_asym a
                     WHERE a.entry_id = en.entry_id AND a.entity_id = en.id
                ), '[]') AS chains,
                COALESCE((
                    SELECT json_agg(DISTINCT jsonb_build_object(
                               'db', r.db_name, 'code', r.db_code,
                               'accession', r.pdbx_db_accession))
                      FROM struct_ref r
                     WHERE r.entry_id = en.entry_id AND r.entity_id = en.id
                ), '[]') AS refs,
                -- The three ways a molecule is made; one entity uses only one.
                COALESCE((
                    SELECT json_agg(s ORDER BY s.src) FROM (
                        SELECT 'Expressed' AS kind, g.pdbx_src_id AS src,
                               g.pdbx_gene_src_scientific_name AS organism,
                               g.pdbx_gene_src_ncbi_taxonomy_id AS taxid,
                               g.pdbx_host_org_scientific_name AS host,
                               g.pdbx_host_org_ncbi_taxonomy_id AS host_taxid,
                               g.pdbx_beg_seq_num AS beg, g.pdbx_end_seq_num AS fin,
                               g.gene_src_common_name AS common, g.gene_src_strain AS strain,
                               g.pdbx_gene_src_gene AS gene, NULL AS cell_line, NULL AS details
                          FROM entity_src_gen g
                         WHERE g.entry_id = en.entry_id AND g.entity_id = en.id
                        UNION ALL
                        SELECT 'Natural', n.pdbx_src_id, n.pdbx_organism_scientific,
                               n.pdbx_ncbi_taxonomy_id, NULL, NULL,
                               n.pdbx_beg_seq_num, n.pdbx_end_seq_num,
                               n.common_name, n.strain, NULL, n.pdbx_cell_line, n.details
                          FROM entity_src_nat n
                         WHERE n.entry_id = en.entry_id AND n.entity_id = en.id
                        UNION ALL
                        SELECT 'Synthetic', y.pdbx_src_id, y.organism_scientific,
                               y.ncbi_taxonomy_id, NULL, NULL,
                               y.pdbx_beg_seq_num, y.pdbx_end_seq_num,
                               y.organism_common_name, NULL, NULL, NULL, y.details
                          FROM pdbx_entity_src_syn y
                         WHERE y.entry_id = en.entry_id AND y.entity_id = en.id) s
                ), '[]') AS sources
           FROM entry e
           JOIN entity en                ON en.entry_id = e.id
           LEFT JOIN entity_poly ep      ON ep.entry_id = en.entry_id AND ep.entity_id = en.id
           LEFT JOIN pdbx_entity_nonpoly np ON np.entry_id = en.entry_id AND np.entity_id = en.id
          WHERE UPPER(e.id) = UPPER($1)`,
        [as_text(id).trim()]
    );

    let [stats, modified] = await Promise.all([chain_stats(id, q), modified_nucleotides(id, q)]);

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
        chains:         row.chains.map((c) => ({ auth: null, ...c, ...stats.get(c.label) })),
        source:         source_of(row.sources),
        references:     sequence_links(row.refs, row.type, row.poly_type, id)
    }));

    return { entities: entities.sort(by_kind_then_id), modified };
}

export async function entry_residues(id, q = query) {
    let result = await q(
        `WITH e AS (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1)),
         s AS (
             SELECT s.entity_id, s.seq_id, s.asym_id,
                    min(s.pdb_seq_num::text || COALESCE(NULLIF(s.pdb_ins_code, ''), '')) AS num,
                    bool_or(s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', '')) AS seen
               FROM pdbx_poly_seq_scheme s WHERE s.entry_id = (SELECT id FROM e)
              GROUP BY s.entity_id, s.seq_id, s.asym_id),
         p AS (
             SELECT entity_id, seq_id, bool_or(seen) AS seen,
                    (array_agg(num ORDER BY length(asym_id), asym_id))[1] AS num
               FROM s GROUP BY entity_id, seq_id)
         SELECT q.entity_id, q.num AS pos, min(q.mon_id) AS code, p.num AS auth,
                COALESCE(p.seen, true) AS seen,
                bool_or(c.mon_nstd_flag = 'n' AND ep.type ILIKE '%nucleotide%') AS modified,
                min(c.name) AS name
           FROM entity_poly_seq q
           JOIN entity_poly ep ON ep.entry_id = q.entry_id AND ep.entity_id = q.entity_id
           LEFT JOIN chem_comp c ON c.id = q.mon_id
           LEFT JOIN p ON p.entity_id = q.entity_id AND p.seq_id = q.num
          WHERE q.entry_id = (SELECT id FROM e)
          GROUP BY q.entity_id, q.num, p.num, p.seen
          ORDER BY q.entity_id, q.num`,
        [as_text(id).trim()]
    );
    let residues = new Map();
    for (const r of result.rows) {
        if (!residues.has(r.entity_id)) residues.set(r.entity_id, []);
        residues.get(r.entity_id).push(r);
    }
    return residues;
}

export async function entry_base_pairs(id, q = query) {
    let result = await q(
        `WITH p AS (
             -- A window, not a subquery per row: the planner re-ran that
             -- subquery for every pair, 13 s for a big NMR ensemble (6WLO).
             SELECT l.*, a.lw_family,
                    min(coalesce(l.pdb_model_number, 1)) OVER () AS first_model
               FROM ndb_base_pair_list l
               JOIN ndb_base_pair_annotation a USING (entry_id, base_pair_id)
              WHERE l.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))),
         b AS (
             SELECT p.*,
                    translate(regexp_replace(COALESCE(c1.parent_comp_id, p.comp_id_1), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_1,
                    translate(regexp_replace(COALESCE(c2.parent_comp_id, p.comp_id_2), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_2,
                    regexp_replace(COALESCE(c1.parent_comp_id, p.comp_id_1), '^D(?=[ACGTU]$)', '') AS letter_1,
                    regexp_replace(COALESCE(c2.parent_comp_id, p.comp_id_2), '^D(?=[ACGTU]$)', '') AS letter_2
               FROM p
               LEFT JOIN chem_comp c1 ON c1.id = p.comp_id_1
               LEFT JOIN chem_comp c2 ON c2.id = p.comp_id_2
              WHERE coalesce(p.pdb_model_number, 1) = p.first_model)
         SELECT auth_asym_id_1 AS chain_1, auth_asym_id_2 AS chain_2, lw_family AS family,
                first_model AS model,
                -- Where the pair sits in the sequence, for the arc picture.
                -- Kept out of the CSV and JSON by PAIR_FIELDS.
                asym_id_1 AS label_1, seq_id_1 AS pos_1,
                asym_id_2 AS label_2, seq_id_2 AS pos_2,
                -- Which copy of the chain: 1 is the one in the file; another
                -- number is a symmetry copy from the crystal, so A1 with A8
                -- under 1 and 2 is two strands, not a hairpin in one.
                COALESCE(struct_oper_id_1, '1') AS copy_1,
                COALESCE(struct_oper_id_2, '1') AS copy_2,
                comp_id_1 || auth_seq_id_1 || COALESCE(NULLIF(pdb_ins_code_1, '?'), '') AS res_1,
                comp_id_2 || auth_seq_id_2 || COALESCE(NULLIF(pdb_ins_code_2, '?'), '') AS res_2,
                CASE WHEN lw_family <> 'cWW' THEN 'nc'
                     WHEN least(base_1, base_2) || greatest(base_1, base_2) IN ('CG', 'AU') THEN 'wc'
                     WHEN least(base_1, base_2) || greatest(base_1, base_2) = 'GU' THEN 'gu'
                     ELSE 'nc' END AS kind,
                -- The two bases in order, T kept apart from U ('AT', 'AU',
                -- 'CG', 'GU'), so the section can say A–T for DNA.
                least(letter_1, letter_2) || greatest(letter_1, letter_2) AS bases
           FROM b
          ORDER BY length(auth_asym_id_1), auth_asym_id_1, seq_id_1, seq_id_2`,
        [as_text(id).trim()]
    );
    return result.rows;
}

export async function entry_assemblies(id, q = query) {
    let key = [as_text(id).trim()];
    let [assemblies, opers] = await Promise.all([
        q(`SELECT a.id, a.details, a.oligomeric_count AS count,
                  json_agg(json_build_object('expr', g.oper_expression, 'chains', g.asym_id_list)
                           ORDER BY g.ordinal) AS gens
             FROM pdbx_struct_assembly a
             JOIN pdbx_struct_assembly_gen g ON g.entry_id = a.entry_id AND g.assembly_id = a.id
            WHERE a.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))
            GROUP BY a.id, a.details, a.oligomeric_count
            ORDER BY length(a.id), a.id`, key),
        q(`SELECT id, ARRAY[matrix_1_1, matrix_1_2, matrix_1_3, vector_1,
                            matrix_2_1, matrix_2_2, matrix_2_3, vector_2,
                            matrix_3_1, matrix_3_2, matrix_3_3, vector_3] AS m
             FROM pdbx_struct_oper_list
            WHERE entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))`, key)]);
    return {
        assemblies: assemblies.rows.map((a) => ({ ...a, gens: a.gens.map((g) => ({
            expr: g.expr, chains: g.chains.split(",") })) })),
        opers: new Map(opers.rows.map((o) => [o.id, o.m.map(Number)]))
    };
}

export async function entry_sequence_tracks(id, q = query) {
    let e = `(SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))`;
    let [residues, steps] = await Promise.all([
        q(`SELECT s.asym_id AS label, s.seq_id AS pos, min(s.mon_id) AS code,
                  min(s.pdb_seq_num::text || COALESCE(NULLIF(s.pdb_ins_code, ''), '')) AS num,
                  bool_or(s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', '')) AS seen,
                  min(COALESCE(c.parent_comp_id, s.mon_id)) AS parent,
                  bool_or(c.mon_nstd_flag = 'n') AS modified
             FROM pdbx_poly_seq_scheme s
             JOIN entity_poly ep ON ep.entry_id = s.entry_id AND ep.entity_id = s.entity_id
             LEFT JOIN chem_comp c ON c.id = s.mon_id
            WHERE s.entry_id = ${e} AND ep.type ILIKE '%nucleotide%'
            GROUP BY s.asym_id, s.seq_id
            ORDER BY length(s.asym_id), s.asym_id, s.seq_id`, [as_text(id).trim()]),
        q(`SELECT t.label_asym_id_1 AS label_1, t.label_seq_id_1 AS pos_1,
                  t.label_asym_id_2 AS label_2, t.label_seq_id_2 AS pos_2,
                  m.assigned_ntc AS ntc, m.assigned_cana AS cana,
                  m.confal_score AS confal, m.closest_ntc AS closest
             FROM ndb_struct_ntc_step t
             JOIN ndb_struct_ntc_step_summary m ON m.entry_id = t.entry_id AND m.step_id = t.id
            WHERE t.entry_id = ${e}
              AND coalesce(t.pdb_model_number, 1) = (SELECT min(coalesce(pdb_model_number, 1))
                                                       FROM ndb_struct_ntc_step WHERE entry_id = ${e})`,
          [as_text(id).trim()])
    ]);
    return { residues: residues.rows, steps: steps.rows };
}

async function modified_nucleotides(id, q) {
    let result = await q(
        `WITH m AS (
             SELECT s.asym_id, s.seq_id, s.mon_id,
                    min(s.pdb_strand_id) AS auth,
                    min(s.pdb_seq_num::text || COALESCE(NULLIF(s.pdb_ins_code, ''), '')) AS num,
                    bool_or(s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', '')) AS seen
               FROM pdbx_poly_seq_scheme s
               JOIN entity_poly p ON p.entry_id = s.entry_id AND p.entity_id = s.entity_id
                                 AND p.type ILIKE '%nucleotide%'
               JOIN chem_comp c   ON c.id = s.mon_id AND c.mon_nstd_flag = 'n'
              WHERE s.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))
              GROUP BY s.asym_id, s.seq_id, s.mon_id)
         SELECT m.mon_id AS code, c.name, m.asym_id AS label, min(m.auth) AS auth,
                json_agg(json_build_object('num', m.num, 'seen', m.seen) ORDER BY m.seq_id) AS positions
           FROM m JOIN chem_comp c ON c.id = m.mon_id
          GROUP BY m.mon_id, c.name, m.asym_id
          ORDER BY length(m.asym_id), m.asym_id, min(m.seq_id)`,
        [as_text(id).trim()]
    );
    return result.rows;
}

// A PDB self-reference says nothing, so it is left out.
const NCBI = "https://www.ncbi.nlm.nih.gov";
const REFERENCE_URL = {
    UNP:  (r) => ({ label: "UniProt",  url: `https://www.uniprot.org/uniprotkb/${r.accession}`,
                    code: r.accession }),
    GB:   (r, protein) => ({ label: "GenBank", url: `${NCBI}/${protein ? "protein" : "nuccore"}/${r.code}` }),
    TPG:  (r) => ({ label: "GenBank TPA", url: `${NCBI}/nuccore/${r.code}` }),
    REF:  (r, protein) => ({ label: "RefSeq", url: `${NCBI}/${protein ? "protein" : "nuccore"}/${r.code}` }),
    EMBL: (r) => ({ label: "ENA",      url: `https://www.ebi.ac.uk/ena/browser/view/${r.accession}`,
                    code: r.accession }),
    PDB:  (r) => ({ label: "PDB",      url: `https://www.rcsb.org/structure/${r.code}` })
};

function sequence_links(refs, type, poly_type, entry_id) {
    if (type !== "polymer") return [];
    let protein = /^polypeptide/i.test(poly_type || "");

    return refs
        .filter((r) => !(r.db === "PDB" && r.code?.toUpperCase() === as_text(entry_id).trim().toUpperCase()))
        .map((r) => {
            let known = REFERENCE_URL[r.db]?.(r, protein);
            return { db: r.db, code: known?.code ?? r.code, label: known?.label ?? r.db,
                     url: known?.url ?? null };
        })
        .sort((a, b) => a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

async function chain_stats(id, q) {
    let result = await q(
        `WITH r AS (
             SELECT s.asym_id, s.seq_id,
                    min(s.pdb_strand_id) AS auth,
                    min(s.pdb_seq_num::text || COALESCE(NULLIF(s.pdb_ins_code, ''), '')) AS num,
                    min(s.mon_id) AS mon,
                    bool_or(s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', '')) AS seen
               FROM pdbx_poly_seq_scheme s
              WHERE s.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))
              GROUP BY s.asym_id, s.seq_id)
         SELECT asym_id,
                min(auth) AS auth,
                count(*)::int AS total,
                (count(*) FILTER (WHERE seen))::int AS modelled,
                (array_agg(num ORDER BY seq_id))[1] AS first,
                (array_agg(num ORDER BY seq_id DESC))[1] AS last,
                COALESCE(json_agg(json_build_object('seq', seq_id, 'num', num, 'mon', mon)
                                  ORDER BY seq_id) FILTER (WHERE NOT seen), '[]') AS missing
           FROM r GROUP BY asym_id`,
        [as_text(id).trim()]
    );

    return new Map(result.rows.map((r) => [r.asym_id, {
        auth: r.auth, total: r.total, modelled: r.modelled, first: r.first, last: r.last,
        missing: missing_runs(r.missing)
    }]));
}

export function missing_runs(missing) {
    let runs = [];

    for (const m of missing) {
        let run = runs.at(-1);
        if (run && m.seq === run.to_seq + 1) {
            Object.assign(run, { to: m.num, to_mon: m.mon, to_seq: m.seq, count: run.count + 1 });
        } else {
            runs.push({ from: m.num, from_mon: m.mon, to: m.num, to_mon: m.mon,
                        from_seq: m.seq, to_seq: m.seq, count: 1 });
        }
    }

    return runs.map(({ from_seq, to_seq, ...run }) => run);
}

export async function entry_ntc_classes(id, q = query) {
    let result = await q(
        `SELECT s.assigned_ntc AS ntc, s.assigned_cana AS cana, count(*)::int AS n
           FROM ndb_struct_ntc_step_summary s
          WHERE s.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))
          GROUP BY 1, 2`,
        [as_text(id).trim()]
    );
    return result.rows;
}

let references = null;

export async function entry_citation(id, q = query) {
    let result = await q(
        `SELECT c.title, c.journal_abbrev AS journal, c.journal_volume AS volume,
                c.page_first, c.page_last, c.year,
                c.pdbx_database_id_doi AS doi, c.pdbx_database_id_pubmed AS pubmed,
                COALESCE((SELECT json_agg(ca.name ORDER BY ca.ordinal, ca.id)
                            FROM citation_author ca
                           WHERE ca.entry_id = c.entry_id AND ca.citation_id = c.id),
                         '[]') AS authors
           FROM citation c
          WHERE UPPER(c.entry_id) = UPPER($1) AND c.id = 'primary'`,
        [as_text(id).trim()]
    );
    let c = result.rows[0];
    if (!c) return null;
    references ??= JSON.parse(readFileSync(new URL("./citations.json", import.meta.url), "utf8")).entries;
    let r = references[as_text(id).trim().toUpperCase()];
    // PMID -1 means none.
    let pubmed = c.pubmed > 0 ? String(c.pubmed) : null;
    let cited = r ? { ...r, source: "reference" } : {
        type: "article", source: "pdb",
        title: clean_title(c.title), authors: c.authors.map(pdb_author),
        journal: c.journal, journal_abbrev: c.journal, volume: c.volume, issue: null,
        page_first: c.page_first, page_last: c.page_last, year: c.year,
        doi: c.doi, pubmed, abstract: null, keywords: null
    };
    return {
        ...cited,
        pages:      [cited.page_first, cited.page_last].filter(Boolean).join("-") || null,
        doi_url:    cited.doi ? "https://doi.org/" + cited.doi : null,
        pubmed_url: cited.pubmed ? "https://pubmed.ncbi.nlm.nih.gov/" + cited.pubmed + "/" : null
    };
}

export function query_problem(query) {
    let page = as_text(query.page);

    if (page !== "" && (!/^[0-9]+$/.test(page) || Number(page) < 1)) {
        return "page must be a whole number of 1 or more";
    }

    for (const lo of FILTERS.filter((f) => f.kind === "range" && f.pair_with)) {
        let min = as_text(query[lo.key]);
        let max = as_text(query[lo.pair_with]);

        if (min !== "" && !Number.isFinite(Number(min))) return `${lo.key} must be a number`;
        if (max !== "" && !Number.isFinite(Number(max))) return `${lo.pair_with} must be a number`;
        if (min !== "" && max !== "" && Number(min) > Number(max)) {
            return `${lo.key} cannot be higher than ${lo.pair_with}`;
        }
    }

    return null;
}
export async function ligand_suggestions(q = query) {
    let result = await q(
        `SELECT n.comp_id AS code, cc.name, count(DISTINCT n.entry_id)::int AS entries
           FROM pdbx_entity_nonpoly n
           LEFT JOIN chem_comp cc ON cc.id = n.comp_id
          WHERE n.comp_id <> 'HOH'
          GROUP BY n.comp_id, cc.name
          ORDER BY entries DESC, n.comp_id`);
    return result.rows;
}

export async function nonstandard_suggestions(q = query) {
    let result = await q(
        `SELECT cc.id AS code, cc.name, cc.parent_comp_id AS parent, count(*)::int AS entries
           FROM doc d
           CROSS JOIN LATERAL unnest(string_to_array(d.residue_codes, ', ')) AS r(code)
           JOIN chem_comp cc ON cc.id = r.code AND cc.mon_nstd_flag = 'n'
          GROUP BY cc.id, cc.name, cc.parent_comp_id
          ORDER BY entries DESC, cc.id`);
    return result.rows;
}

const ORGANISM_ROWS = {
    source_organisms: `SELECT s.taxid, s.organism, array_agg(DISTINCT s.entry_id) AS ids
                         FROM ${SOURCES_SQL} s
                        WHERE s.organism IS NOT NULL OR s.taxid IS NOT NULL GROUP BY 1, 2`,
    expression_hosts: `SELECT g.pdbx_host_org_ncbi_taxonomy_id AS taxid,
                              g.pdbx_host_org_scientific_name AS organism,
                              array_agg(DISTINCT g.entry_id) AS ids
                         FROM entity_src_gen g
                        WHERE g.pdbx_host_org_scientific_name IS NOT NULL
                           OR g.pdbx_host_org_ncbi_taxonomy_id IS NOT NULL
                        GROUP BY 1, 2`
};
const organism_cache = {};

export async function organism_suggestions(role, q = query) {
    if (organism_cache[role] && Date.now() - organism_cache[role].at < BROWSE_TTL_MS) {
        return organism_cache[role].rows;
    }
    let groups = (await q(ORGANISM_ROWS[role])).rows;

    let names = new Map();
    for (const g of groups) {
        let t = g.taxid === null ? null : taxon(g.taxid);
        let code = t ? t.name : g.organism;
        if (code && !names.has(code)) names.set(code, t ? t.common.join(", ") : "");
    }

    let rows = [...names].map(([code, name]) => {
        let lower = code.toLowerCase();
        let taxa = new Set(taxa_named(code));
        let ids = new Set();
        for (const g of groups) {
            if (taxa.has(g.taxid) || (g.organism ?? "").toLowerCase().includes(lower)) {
                g.ids.forEach((id) => ids.add(id));
            }
        }
        return { code, name, entries: ids.size };
    }).sort((a, b) => b.entries - a.entries || a.code.localeCompare(b.code));

    organism_cache[role] = { at: Date.now(), rows };
    return rows;
}

export async function pill_counts(q = query) {
    let counts = {};
    for (const f of FILTERS.filter((f) => f.count_by)) {
        let result = await q(`SELECT (${f.count_by}) AS value, count(*)::int AS n
                                FROM entry e GROUP BY 1`);
        counts[f.key] = Object.fromEntries(result.rows.map((r) => [r.value, r.n]));
    }
    return counts;
}

// Every sequence held in memory (Postgres took 120-290 ms); a hash of entity_poly tells when to rebuild.
export const SAME_SEQUENCE_CHECK_MS = 2000;
const SEQUENCE_SIGNATURE =
    `SELECT count(*)::text || ' ' || coalesce(sum(hashtext(entry_id || ' ' || entity_id || ' ' ||
            coalesce(type, '') || ' ' || coalesce(pdbx_seq_one_letter_code_can, ''))::bigint), 0)::text AS s
       FROM entity_poly`;
let seq_index = null;
let seq_checked = 0;
let seq_pending = null;

async function build_sequence_index(q) {
    let [signature, rows] = await Promise.all([
        q(SEQUENCE_SIGNATURE),
        q(`SELECT entry_id, entity_id, type, pdbx_seq_one_letter_code_can AS seq
             FROM entity_poly WHERE type ILIKE '%nucleotide%'`)
    ]);
    let by_key = new Map();
    let by_entity = new Map();
    for (const r of rows.rows) {
        let key = sequence_key(r.type, r.seq);
        if (!key) continue;
        by_entity.set(`${r.entry_id.toUpperCase()} ${r.entity_id}`, key);
        if (!by_key.has(key)) by_key.set(key, []);
        by_key.get(key).push({ entry: r.entry_id, entity: r.entity_id });
    }
    return { signature: signature.rows[0].s, by_key, by_entity };
}

export async function sequence_index(q = query, now = Date.now()) {
    if (seq_index && now - seq_checked < SAME_SEQUENCE_CHECK_MS) return seq_index;
    seq_pending ??= (async () => {
        try {
            let sig = (await q(SEQUENCE_SIGNATURE)).rows[0].s;
            if (!seq_index || seq_index.signature !== sig) seq_index = await build_sequence_index(q);
            seq_checked = Date.now();
            return seq_index;
        } finally {
            seq_pending = null;
        }
    })();
    return seq_pending;
}

export async function same_sequence_groups(id, q = query) {
    let index = await sequence_index(q);
    let upper = as_text(id).trim().toUpperCase();
    let groups = [];
    let done = new Set();
    let mine = [...index.by_entity.entries()].filter(([k]) => k.startsWith(upper + " "))
        .sort(([x], [y]) => x.localeCompare(y, "en", { numeric: true }));
    for (const [, key] of mine) {
        if (done.has(key)) continue;
        done.add(key);
        let members = index.by_key.get(key);
        if (!members.some((m) => m.entry.toUpperCase() !== upper)) continue;
        groups.push({ key, members: [...members].sort((a, b) =>
            (b.entry.toUpperCase() === upper) - (a.entry.toUpperCase() === upper) ||
            a.entry.localeCompare(b.entry) || a.entity.localeCompare(b.entity, "en", { numeric: true })) });
    }
    return groups;
}

export async function same_sequence_count(id, q = query) {
    let upper = as_text(id).trim().toUpperCase();
    let others = new Set();
    for (const g of await same_sequence_groups(id, q)) {
        for (const m of g.members) if (m.entry.toUpperCase() !== upper) others.add(m.entry);
    }
    return others.size;
}

export async function chain_sequence_key(entry, label, q = query) {
    let index = await sequence_index(q);
    let r = await q(`SELECT entry_id, entity_id FROM struct_asym WHERE upper(entry_id) = upper($1) AND id = $2`,
                    [as_text(entry).trim(), as_text(label).trim()]);
    if (!r.rows.length) return null;
    let { entry_id, entity_id } = r.rows[0];
    let key = index.by_entity.get(`${entry_id.toUpperCase()} ${entity_id}`);
    return key ? { key, entry: entry_id, entity: entity_id, label: as_text(label).trim() } : null;
}

export async function same_sequence_members(members, q = query) {
    let entries = [...new Set(members.map((m) => m.entry))];
    let [about, chains] = await Promise.all([
        q(`SELECT e.id AS entry, s.title,
                  (SELECT string_agg(DISTINCT x.method, ', ') FROM exptl x WHERE x.entry_id = e.id) AS method,
                  ${RESOLUTION_SQL} AS resolution
             FROM entry e
             LEFT JOIN struct s ON s.entry_id = e.id
            WHERE e.id = ANY($1)`, [entries]),
        q(`SELECT s.entry_id AS entry, s.entity_id AS entity, s.asym_id AS label, min(s.pdb_strand_id) AS auth,
                  count(DISTINCT s.seq_id) FILTER (WHERE s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', ''))::int AS seen,
                  count(DISTINCT s.seq_id)::int AS length
             FROM pdbx_poly_seq_scheme s
             JOIN unnest($1::text[], $2::text[]) AS m(entry, entity) ON s.entry_id = m.entry AND s.entity_id = m.entity
            -- Says the same as the join, but lets Postgres use the entry_id
            -- index instead of reading all 4.7 million rows (1.4 s).
            WHERE s.entry_id = ANY($1)
            GROUP BY s.entry_id, s.entity_id, s.asym_id
            ORDER BY s.entry_id, length(s.asym_id), s.asym_id`,
          [members.map((m) => m.entry), members.map((m) => m.entity)])
    ]);
    let by_entry = new Map(about.rows.map((r) => [r.entry, { ...r, resolution: r.resolution === null ? null : Number(r.resolution) }]));
    return { about: by_entry, chains: chains.rows };
}

export async function chain_tracks(chains, q = query) {
    let entries = chains.map((c) => c.entry);
    let labels = chains.map((c) => c.label);
    let wanted = `JOIN unnest($1::text[], $2::text[]) AS w(entry, label)`;
    let [residues, pairs, steps] = await Promise.all([
        q(`SELECT s.entry_id AS entry, s.asym_id AS label, s.seq_id AS pos,
                  string_agg(DISTINCT s.mon_id, '/' ORDER BY s.mon_id) AS code,
                  min(s.pdb_seq_num::text || COALESCE(NULLIF(s.pdb_ins_code, ''), '')) AS num,
                  bool_or(s.auth_mon_id IS NOT NULL AND s.auth_mon_id NOT IN ('?', '')) AS seen,
                  min(COALESCE(c.parent_comp_id, s.mon_id)) AS parent,
                  bool_or(c.mon_nstd_flag = 'n') AS modified,
                  string_agg(DISTINCT c.name, ' / ') FILTER (WHERE c.mon_nstd_flag = 'n') AS chem
             FROM pdbx_poly_seq_scheme s
             ${wanted} ON s.entry_id = w.entry AND s.asym_id = w.label
             LEFT JOIN chem_comp c ON c.id = s.mon_id
            GROUP BY s.entry_id, s.asym_id, s.seq_id
            ORDER BY s.entry_id, s.asym_id, s.seq_id`, [entries, labels]),
        q(`WITH m AS (SELECT l.entry_id, min(coalesce(l.pdb_model_number, 1)) AS first_model
                        FROM ndb_base_pair_list l WHERE l.entry_id = ANY($1) GROUP BY l.entry_id),
              p AS (SELECT l.entry_id, l.asym_id_1 AS label, l.seq_id_1 AS pos_1, l.seq_id_2 AS pos_2,
                           a.lw_family AS family,
                           translate(regexp_replace(COALESCE(c1.parent_comp_id, l.comp_id_1), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_1,
                           translate(regexp_replace(COALESCE(c2.parent_comp_id, l.comp_id_2), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_2
                      FROM ndb_base_pair_list l
                      ${wanted} ON l.entry_id = w.entry AND l.asym_id_1 = w.label
                      JOIN m ON m.entry_id = l.entry_id AND coalesce(l.pdb_model_number, 1) = m.first_model
                      JOIN ndb_base_pair_annotation a ON a.entry_id = l.entry_id AND a.base_pair_id = l.base_pair_id
                      LEFT JOIN chem_comp c1 ON c1.id = l.comp_id_1
                      LEFT JOIN chem_comp c2 ON c2.id = l.comp_id_2
                     WHERE l.asym_id_2 = l.asym_id_1
                       AND COALESCE(l.struct_oper_id_1, '1') = '1' AND COALESCE(l.struct_oper_id_2, '1') = '1')
           SELECT entry_id AS entry, label, pos_1, pos_2, family,
                  CASE WHEN family <> 'cWW' THEN 'nc'
                       WHEN least(base_1, base_2) || greatest(base_1, base_2) IN ('CG', 'AU') THEN 'wc'
                       WHEN least(base_1, base_2) || greatest(base_1, base_2) = 'GU' THEN 'gu'
                       ELSE 'nc' END AS kind
             FROM p`, [entries, labels]),
        // Steps gathered first: the planned join ran past 15 s for 5UYM's tRNA group.
        q(`WITH m AS (SELECT t.entry_id, min(coalesce(t.pdb_model_number, 1)) AS first_model
                        FROM ndb_struct_ntc_step t WHERE t.entry_id = ANY($1) GROUP BY t.entry_id),
              t AS MATERIALIZED (
                SELECT t.id, t.entry_id, t.pdb_model_number, t.label_asym_id_1, t.label_seq_id_1, t.label_seq_id_2,
                       t.label_alt_id_1, t.label_alt_id_2
                  FROM ndb_struct_ntc_step t
                  ${wanted} ON t.entry_id = w.entry AND t.label_asym_id_1 = w.label
                 WHERE t.entry_id = ANY($1)
                   AND t.label_asym_id_2 = t.label_asym_id_1 AND t.label_seq_id_2 = t.label_seq_id_1 + 1)
           SELECT DISTINCT ON (t.entry_id, t.label_asym_id_1, t.label_seq_id_1)
                  t.entry_id AS entry, t.label_asym_id_1 AS label, t.label_seq_id_1 AS pos_1, t.label_seq_id_2 AS pos_2,
                  s.assigned_ntc AS ntc, s.assigned_cana AS cana, s.confal_score AS confal
             FROM t
             JOIN m ON m.entry_id = t.entry_id AND coalesce(t.pdb_model_number, 1) = m.first_model
             JOIN ndb_struct_ntc_step_summary s ON s.entry_id = t.entry_id AND s.step_id = t.id
            ORDER BY t.entry_id, t.label_asym_id_1, t.label_seq_id_1,
                     coalesce(t.label_alt_id_1, ''), coalesce(t.label_alt_id_2, ''), t.id`, [entries, labels])
    ]);
    let out = new Map(chains.map((c) => [`${c.entry} ${c.label}`, { residues: [], pairs: [], steps: [] }]));
    for (const [kind, rows] of [["residues", residues.rows], ["pairs", pairs.rows], ["steps", steps.rows]]) {
        for (const r of rows) out.get(`${r.entry} ${r.label}`)?.[kind].push(r);
    }
    return out;
}

const chain_id = (c) => `${c.entry}:${c.label}`;
const chain_title = (c) => `${c.entry} ${c.auth ?? c.label}`;
const mean_confal = (steps) => {
    let sure = steps.filter((s) => s.ntc && s.ntc !== "NANT" && s.confal !== null).map((s) => Number(s.confal));
    return sure.length ? Math.round(sure.reduce((x, y) => x + y, 0) / sure.length) : null;
};

export async function same_sequence(id, q = query) {
    let upper = as_text(id).trim().toUpperCase();
    let groups = await Promise.all((await same_sequence_groups(id, q)).map(async (g) => {
        let { about, chains } = await same_sequence_members(g.members, q);
        if (!chains.length) return null;
        let tracks = await chain_tracks(chains, q);
        let [type, seq] = g.key.split("\n");
        let ref = chains.find((c) => c.entry.toUpperCase() === upper) ?? chains[0];
        let ref_tracks = tracks.get(`${ref.entry} ${ref.label}`);
        let rows = chains.map((c) => {
            let t = tracks.get(`${c.entry} ${c.label}`);
            let a = about.get(c.entry) ?? {};
            let summary = null;
            if (c !== ref) {
                let s = compare_chains({ name: chain_title(ref), ...ref_tracks }, { name: chain_title(c), ...t }, { picture: false }).summary;
                summary = { verdict: s.verdict, headline: s.headline, differences: s.differences };
            }
            return { id: chain_id(c), entry: c.entry, label: c.label, auth: c.auth, name: chain_title(c),
                     seen: c.seen, length: c.length, confal: mean_confal(t.steps), pairs: t.pairs.length,
                     resolution: a.resolution ?? null, summary };
        });
        let best = [...rows].sort(best_rank)[0];
        let entries = [];
        for (const r of rows) {
            let e = entries.find((x) => x.entry === r.entry);
            if (!e) {
                let a = about.get(r.entry) ?? {};
                e = { entry: r.entry, title: a.title ?? null, method: a.method ?? null, resolution: a.resolution ?? null,
                      this: r.entry.toUpperCase() === upper, chains: [] };
                entries.push(e);
            }
            e.chains.push(r);
        }
        return { kind: POLY_KINDS[type] ?? "Other", type, length: seq.length,
                 ref: chain_id(ref), best: best.id, entries };
    }));
    return groups.filter(Boolean);
}

export async function compare_same_sequence(a_id, b_id, q = query) {
    let parse = (s) => { let [entry, label] = as_text(s).split(":"); return [entry ?? "", label ?? ""]; };
    let [a, b] = await Promise.all([chain_sequence_key(...parse(a_id), q), chain_sequence_key(...parse(b_id), q)]);
    if (!a || !b) return null;
    if (a.key !== b.key) return false;
    let { chains } = await same_sequence_members([{ entry: a.entry, entity: a.entity }, { entry: b.entry, entity: b.entity }], q);
    let find = (x) => chains.find((c) => c.entry === x.entry && c.label === x.label);
    let [ca, cb] = [find(a), find(b)];
    if (!ca || !cb) return null;
    let tracks = await chain_tracks([ca, cb], q);
    let result = compare_chains({ name: chain_title(ca), ...tracks.get(`${ca.entry} ${ca.label}`) },
                                { name: chain_title(cb), ...tracks.get(`${cb.entry} ${cb.label}`) });
    return { ...result, ids: [chain_id(ca), chain_id(cb)] };
}
