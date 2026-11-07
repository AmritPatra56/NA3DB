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
    // A whole number that fits an integer column; anything else matches
    // nothing rather than reaching PostgreSQL as NaN or 1e99.
    number: { active: (v) => v !== "",    param: (v) => (/^\s*\d{1,9}\s*$/.test(v) ? Number(v) : -1) },
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

        // Old spellings a bookmark may still carry, turned into current ones.
        if (filter.expand) value = filter.expand(value);

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
    LEFT JOIN refine rfn              ON rfn.entry_id = e.id
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
const blank = (v) => (v && v.trim()) || null;

// How a molecule was made, from its source rows: one segment for most, one per
// stretch of sequence for a chimera (3WFR molecule 3: 1-15, 16-453, 454-512).
// The host is kept only when it is not the source organism itself.
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

// Every residue of every polymer, for the sequence shown on the structure
// page: the code (2MG, not G), whether it is a modified nucleotide, the
// author number of the first chain, and whether any chain has it in the
// model. Kept out of entry_contents so the API is not 89,527 rows longer
// for 9MU2. A Map from entity id to residues in sequence order.
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

// Every annotated base pair of one entry, in model 1 (an NMR entry repeats
// each pair per model). kind is judged on the parent bases, so 1OB5's
// G30-5MC40 (cWW_G-5MC) is Watson-Crick: 'wc' is cWW G-C or A-U/T, 'gu' is
// cWW G with U/T, 'nc' is every other pair. See db/migrations/014.
export async function entry_base_pairs(id, q = query) {
    let result = await q(
        `WITH p AS (
             SELECT l.*, a.lw_family,
                    (SELECT min(coalesce(m.pdb_model_number, 1)) FROM ndb_base_pair_list m
                      WHERE m.entry_id = l.entry_id) AS first_model
               FROM ndb_base_pair_list l
               JOIN ndb_base_pair_annotation a USING (entry_id, base_pair_id)
              WHERE l.entry_id = (SELECT e.id FROM entry e WHERE UPPER(e.id) = UPPER($1))),
         b AS (
             SELECT p.*,
                    translate(regexp_replace(COALESCE(c1.parent_comp_id, p.comp_id_1), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_1,
                    translate(regexp_replace(COALESCE(c2.parent_comp_id, p.comp_id_2), '^D(?=[ACGTU]$)', ''), 'T', 'U') AS base_2
               FROM p
               LEFT JOIN chem_comp c1 ON c1.id = p.comp_id_1
               LEFT JOIN chem_comp c2 ON c2.id = p.comp_id_2
              WHERE coalesce(p.pdb_model_number, 1) = p.first_model)
         SELECT auth_asym_id_1 AS chain_1, auth_asym_id_2 AS chain_2, lw_family AS family,
                first_model AS model,
                comp_id_1 || auth_seq_id_1 || COALESCE(NULLIF(pdb_ins_code_1, '?'), '') AS res_1,
                comp_id_2 || auth_seq_id_2 || COALESCE(NULLIF(pdb_ins_code_2, '?'), '') AS res_2,
                CASE WHEN lw_family <> 'cWW' THEN 'nc'
                     WHEN least(base_1, base_2) || greatest(base_1, base_2) IN ('CG', 'AU') THEN 'wc'
                     WHEN least(base_1, base_2) || greatest(base_1, base_2) = 'GU' THEN 'gu'
                     ELSE 'nc' END AS kind
           FROM b
          ORDER BY length(auth_asym_id_1), auth_asym_id_1, seq_id_1, seq_id_2`,
        [as_text(id).trim()]
    );
    return result.rows;
}

// Where each modified nucleotide sits, one row per code and chain, in the
// author numbering the Numbering column uses. Nucleic-acid chains only, the
// same rule as the residue filter, so a protein's MSE is not listed.
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

// Where a molecule's sequence comes from, as links. A PDB reference to the
// entry itself, as for most synthetic DNA and RNA (2,672 nucleic acid
// entities), says only "this sequence is here" and is left out. A database
// with no known address (NOR) keeps its name and code without a url.
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

// Per polymer chain: how much of the sequence is in the model, which residues
// are missing, and the author numbering a paper uses. A residue with no
// auth_mon_id was in the sequence but not seen in the density. Alternative
// residues at one position count once.
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

// Missing residues as runs of consecutive positions: 1L9A's two gaps are one
// run, "A173-G174", not two entries.
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

// Every citation of one structure, the primary first, then the related ones
// by id as a number. 129 entries have more than one; the cards show only the
// primary. Whitespace is collapsed because CIF wraps long titles.
export async function entry_citations(id, q = query) {
    let result = await q(
        `SELECT c.id, c.id = 'primary' AS primary,
                regexp_replace(trim(c.title), '\\s+', ' ', 'g') AS title,
                c.journal_abbrev AS journal, c.journal_volume AS volume,
                c.page_first, c.page_last, c.year,
                c.pdbx_database_id_doi AS doi, c.pdbx_database_id_pubmed AS pubmed,
                COALESCE((SELECT json_agg(ca.name ORDER BY ca.ordinal, ca.id)
                            FROM citation_author ca
                           WHERE ca.entry_id = c.entry_id AND ca.citation_id = c.id),
                         '[]') AS authors
           FROM citation c
          WHERE UPPER(c.entry_id) = UPPER($1)
          ORDER BY c.id <> 'primary', length(c.id), c.id`,
        [as_text(id).trim()]
    );

    return result.rows.map((c) => ({
        ...c,
        pages:      [c.page_first, c.page_last].filter(Boolean).join("-") || null,
        doi_url:    c.doi ? "https://doi.org/" + c.doi : null,
        pubmed_url: c.pubmed ? "https://pubmed.ncbi.nlm.nih.gov/" + c.pubmed + "/" : null
    }));
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
// Every ligand in the database, water left out, most common first, for the
// Ligand box's suggestions. 339 rows: small enough to send whole.
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

// How many entries each pill of a counted filter finds, as
// { polymer_type: { DNA: 197, ... } }. One GROUP BY per filter.
export async function pill_counts(q = query) {
    let counts = {};
    for (const f of FILTERS.filter((f) => f.count_by)) {
        let result = await q(`SELECT (${f.count_by}) AS value, count(*)::int AS n
                                FROM entry e GROUP BY 1`);
        counts[f.key] = Object.fromEntries(result.rows.map((r) => [r.value, r.n]));
    }
    return counts;
}
