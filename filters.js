// filters.js - every question the search can answer and every column it can
// return, as data. Server only: it holds the SQL. The browser gets the safe
// fields from public_registry() via GET /api/fields.

// Asked in the SELECT and in the WHERE, so a result cannot contradict its page.
const HAS_PROTEIN = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%polypeptide%')`;
const HAS_NA      = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%nucleotide%')`;
const HAS_SACC    = `EXISTS (SELECT 1 FROM entity_poly ep
                             WHERE ep.entry_id = e.id AND ep.type ILIKE '%saccharide%')`;

// Protein/NA first: such an entry also has a nucleic acid and would otherwise
// stop at 'Nucleic acid'.
export const POLYMER_TYPE_SQL = `CASE
        WHEN ${HAS_PROTEIN} AND ${HAS_NA}   THEN 'Protein/NA'
        WHEN ${HAS_PROTEIN} AND ${HAS_SACC} THEN 'Protein/Oligosaccharide'
        WHEN ${HAS_NA}                      THEN 'Nucleic acid'
        WHEN ${HAS_SACC}                    THEN 'Oligosaccharide'
        WHEN ${HAS_PROTEIN}                 THEN 'Protein'
        ELSE 'Other'
    END`;

// A pill option is {value, label}; a bare string means the two are the same.
const option = (o) => (typeof o === "string" ? { value: o, label: o } : o);

// The category boxes, in the order they appear down the form. A filter lands
// in a box by its `group`. slug colours the dot (style.css); note is optional.
export const GROUPS = [
    { name: "Demographics", slug: "demographics" },
    {
        name: "3D Features", slug: "features",
        note: "Confal score runs 0 to 96, and NtC assignment is one of 97 " +
              "conformer classes such as AA00. Both come from DNATCO."
    },
    { name: "Structure Components", slug: "components" }
];


// What to put in the box, shown under it on the landing page. Each one is a
// different KIND of thing, so reading the line once tells you what the box
// accepts. `kind` is the label beside it, not a category in the data.
export const EXAMPLES = [
    { term: "119D",             kind: "an entry id" },
    { term: "tRNA",             kind: "a molecule" },
    { term: "ribozyme",         kind: "an entity" },
    { term: "Z-DNA",            kind: "a structure" },
    { term: "Escherichia coli", kind: "an organism" },
    { term: "Leonard",          kind: "an author" },

    // Residues are not in the box: searching them means scanning 3.8M rows in
    // entity_poly_seq, which cost 348-643 ms inside the box's OR against 6-45
    // without it. This one goes to the filter that owns them, which also opens
    // the panel and shows where that filter lives.
    { term: "PSU", kind: "a residue", filter: "nonstandard_residue" }
];

// Where an example sends you. Everything goes through the box unless it names
// a filter of its own.
export function example_url(example) {
    return "/search?" + (example.filter || "q") + "=" + encodeURIComponent(example.term);
}


// One object per searchable question. `kind` decides how the value is read and
// drawn; `where` is SQL with ? for the value; `clause` is the escape hatch for
// a filter whose SQL takes no parameter. Never rename a key: bookmarks use it.
// The SQL half of the search box's loose matching: the same punctuation the
// browser drops from what was typed, dropped from the column being searched.
// Spaces are kept on both sides. See like_normalised in search.js.
const normalised = (column) =>
    `regexp_replace(lower(${column}), '[^a-z0-9 ]', '', 'g')`;

export const FILTERS = [
    // One box for whatever the visitor already knows: an id, a molecule, a
    // form, an organism, a person. Five ? marks and one value, because add()
    // replaces every ? with the same $n.
    //
    // No index on struct.title on purpose: scanning 1,489 titles measures
    // 2.9 ms, faster than the indexed lookups beside it, so an index here
    // would be upkeep for nothing.
    {
        key: "q", label: "Search", group: "Demographics", kind: "text",
        // Drawn across the top of the page rather than inside the panel.
        prominent: true,
        // `match` in the query says whether this clause is used or negated.
        negatable: "match",
        // Every field this searches is gathered into one row per entry by
        // the doc materialized view, so this is one lookup rather than the
        // five correlated subqueries it used to be. See db/migrations/007.
        //
        // Two kinds of field, matched two ways.
        //
        // The id and the entity description stay literal, because punctuation
        // means something in both: 119D is an id, and an entity description
        // is often a chemical name like 11,19-DIMETHYL..., which normalises
        // to 1119dimethyl and would then answer a search for 119D.
        //
        // The prose column is already normalised in the view, so ?~ (the
        // typed value with its punctuation dropped) is what it is matched
        // against, and zdna finds Z-DNA.
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND (   d.id       ILIKE ?
                                   OR d.entities ILIKE ?
                                   OR d.prose    LIKE  ?~))`
    },

    // The only filter on a column of `entry` itself. ILIKE because plain LIKE
    // and = are case-sensitive in PostgreSQL, unlike MySQL.
    {
        key: "entry_id", label: "Entry ID", group: "Demographics", kind: "text",
        where: `AND e.id ILIKE ?`
    },

    {
        key: "author_name", label: "Author name", group: "Demographics", kind: "text",
        where: `AND EXISTS (SELECT 1 FROM citation_author ca
                            WHERE ca.entry_id = e.id
                              AND ca.citation_id = 'primary'
                              AND ca.name ILIKE ?)`
    },

    // = ANY(?) takes the whole array as one parameter, however many pills are
    // on. IN (...) would need a changing number of placeholders.
    {
        key: "experimental_method", label: "Experimental method",
        group: "Demographics", kind: "pills", any: true,
        options: [
            { value: "X-RAY DIFFRACTION",        label: "X-ray" },
            { value: "ELECTRON MICROSCOPY",      label: "EM" },
            { value: "SOLID-STATE NMR",          label: "Solid NMR" },
            { value: "SOLUTION NMR",             label: "NMR" },
            { value: "NEUTRON DIFFRACTION",      label: "Neutron" },
            { value: "ELECTRON CRYSTALLOGRAPHY", label: "Electron cryst." },
            { value: "POWDER DIFFRACTION",       label: "Powder" },
            { value: "FIBER DIFFRACTION",        label: "Fiber" },
            { value: "SOLUTION SCATTERING",      label: "Scattering" },
            "EPR",
            { value: "FLUORESCENCE TRANSFER",    label: "FRET" },
            { value: "INFRARED SPECTROSCOPY",    label: "IR" },
            { value: "THEORETICAL MODEL",        label: "Model" }
        ].map(option),
        where: `AND EXISTS (SELECT 1 FROM exptl x
                            WHERE x.entry_id = e.id AND x.method = ANY(?))`
    },

    // Two filters, one control: pair_with tells the form to draw them together.
    // An entry with no NtC row matches neither end.
    {
        key: "confal_min", label: "Confal score", group: "3D Features", kind: "range",
        answered_by: "confal_score",
        placeholder: "min", pair_with: "confal_max",
        where: `AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                            WHERE o.entry_id = e.id AND o.confal_score >= ?)`
    },

    {
        key: "confal_max", label: "Confal score", group: "3D Features", kind: "range",
        answered_by: "confal_score",
        placeholder: "max",
        where: `AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                            WHERE o.entry_id = e.id AND o.confal_score <= ?)`
    },

    {
        key: "assigned_ntc", label: "Assigned NtC", group: "3D Features", kind: "text",
        answered_by: "assigned_ntc",
        where: `AND EXISTS (SELECT 1 FROM ndb_struct_ntc_step_summary ss
                            WHERE ss.entry_id = e.id
                              AND ss.assigned_ntc ILIKE ?)`
    },

    {
        key: "entity_name", label: "Entity name",
        group: "Structure Components", kind: "text",
        where: `AND EXISTS (SELECT 1 FROM entity ent
                            WHERE ent.entry_id = e.id
                              AND ent.pdbx_description ILIKE ?)`
    },

    {
        key: "source_organism", label: "Source organism",
        group: "Structure Components", kind: "text",
        where: `AND EXISTS (SELECT 1 FROM entity_src_gen g
                            WHERE g.entry_id = e.id
                              AND g.pdbx_gene_src_scientific_name ILIKE ?)`
    },

    // Matches the residue code as well as its name, because a code is what
    // people type. ARRAY(SELECT ...) and not a join: a join makes the chem_comp
    // lookup correlated and re-runs it per entry. 435 ms against 7 ms.
    {
        key: "nonstandard_residue", label: "Non-standard residue",
        group: "Structure Components", kind: "text",
        where: `AND EXISTS (SELECT 1 FROM entity_poly_seq eps
                            WHERE eps.entry_id = e.id
                              AND eps.mon_id = ANY (ARRAY(
                                  SELECT cc.id FROM chem_comp cc
                                  WHERE cc.mon_nstd_flag = 'n'
                                    AND (cc.id ILIKE ? OR cc.name ILIKE ?))))`
    },

    {
        key: "polymer_type", label: "Polymer type",
        group: "Structure Components", kind: "pills", any: true,
        options: ["Nucleic acid", "Oligosaccharide", "Protein", "Protein/NA",
                  "Protein/Oligosaccharide", "Other"].map(option),
        where: `AND (${POLYMER_TYPE_SQL}) = ANY(?)`
    },

    // Reads the column stored by migration 006: 0.9 ms against 276 ms. Both
    // pills selected is the same as neither, so nothing is excluded.
    {
        key: "monomer_flag", label: "Monomer standard flag",
        answered_by: "monomer_flag",
        group: "Structure Components", kind: "pills", any: false,
        options: ["Standard", "Non-Standard"].map(option),
        clause: (v) => {
            if (v.length !== 1) return null;
            if (v[0] === "Non-Standard") return "AND e.has_nonstandard_residue IS TRUE";
            if (v[0] === "Standard")     return "AND e.has_nonstandard_residue IS NOT TRUE";
            return null;
        }
    }
];

// A range value arrives from a URL as a single string, like a text one.
const of_kind = (...kinds) =>
    FILTERS.filter((f) => kinds.includes(f.kind)).map((f) => f.key);

export const TEXT_FILTERS = of_kind("text", "range");
export const PILL_FILTERS = of_kind("pills");


// The orders the results can be put in. `join` is what the paging query needs
// in scope to see the column, and `sql` is the ORDER BY. e.id is appended as a
// tiebreaker: 1,489 entries share only 292 resolutions, and without a unique
// last key a tied row can land on two pages or on none. `unique: true` says a
// column is already unique and needs no tiebreaker.
//
// NULLS LAST in both directions, because a missing value is not a small one:
// 629 structures have no resolution, and they belong at the end either way.
export const SORTS = [
    {
        key: "deposition_desc", label: "Deposition date, newest first",
        join: "LEFT JOIN pdbx_database_status ds ON ds.entry_id = e.id",
        sql: "ds.recvd_initial_deposition_date DESC NULLS LAST"
    },
    {
        key: "deposition_asc", label: "Deposition date, oldest first",
        join: "LEFT JOIN pdbx_database_status ds ON ds.entry_id = e.id",
        sql: "ds.recvd_initial_deposition_date ASC NULLS LAST"
    },
    {
        key: "resolution_asc", label: "Resolution, best first",
        join: "LEFT JOIN reflns rf ON rf.entry_id = e.id",
        sql: "rf.d_resolution_high ASC NULLS LAST"
    },
    {
        key: "resolution_desc", label: "Resolution, worst first",
        join: "LEFT JOIN reflns rf ON rf.entry_id = e.id",
        sql: "rf.d_resolution_high DESC NULLS LAST"
    },
    {
        key: "confal_desc", label: "Confal score, highest first",
        join: "LEFT JOIN ndb_struct_ntc_overall ntc ON ntc.entry_id = e.id",
        sql: "ntc.confal_score DESC NULLS LAST"
    },
    {
        key: "confal_asc", label: "Confal score, lowest first",
        join: "LEFT JOIN ndb_struct_ntc_overall ntc ON ntc.entry_id = e.id",
        sql: "ntc.confal_score ASC NULLS LAST"
    },

    // On `entry` itself, so no join, and unique, so no tiebreaker.
    {
        key: "id_asc", label: "Entry ID, A to Z",
        join: "", sql: "e.id ASC", unique: true
    },
    {
        key: "id_desc", label: "Entry ID, Z to A",
        join: "", sql: "e.id DESC", unique: true
    }
];

// The order used when the URL asks for nothing, or asks for something unknown.
// By key and not by position, so reordering the dropdown cannot change it.
export const DEFAULT_SORT = SORTS.find((s) => s.key === "id_asc");

// One sort by key, never a value from the URL reaching the SQL: an unknown key
// falls back to the default rather than being interpolated.
export function sort_by(key) {
    return SORTS.find((s) => s.key === key) || DEFAULT_SORT;
}


// What the search box means. "excludes" turns its clause into NOT (...), so
// the two answers always add up to the whole database.
export const MATCH_MODES = [
    { key: "contains", label: "Contains" },
    { key: "excludes", label: "Excludes" }
];

export const DEFAULT_MATCH = MATCH_MODES[0].key;

// Looked up by key, so an unknown mode falls back rather than reaching the SQL.
export function match_mode(value) {
    return MATCH_MODES.some((m) => m.key === value) ? value : DEFAULT_MATCH;
}


// How many results a page holds. Any whole number the visitor types, capped
// so one request cannot ask for the whole database and every column with it.
// The suggestions are what the control offers; they are not a restriction.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;
export const PAGE_SIZE_SUGGESTIONS = [20, 25, 50, 100];

// A whole number between 1 and the cap, or the default. Safe to write into a
// LIMIT because what comes back is always digits, the same guarantee as_page
// gives the OFFSET beside it.
export function page_size_from(value) {
    let asked = Math.floor(Number(value));

    if (!Number.isFinite(asked) || asked < 1) return DEFAULT_PAGE_SIZE;

    return Math.min(asked, MAX_PAGE_SIZE);
}


// One object per returnable column. A separate list from FILTERS because the
// two overlap without containing each other: `title` is shown and not searched.
//
// scope says which query fetches it: "entry" for every result, "detail" only
// when one entry is asked for. show says where it is DISPLAYED, which is a
// different question: "page" is the full structure page, "card" a result card.
// Absent means ["page"] alone; an empty list means the column is fetched but
// never shown.
export const COLUMNS = [
    // Fetched because the links are built from it, shown nowhere: the heading
    // already says it.
    {
        key: "pdb_id", label: "Entry ID", group: "Demographics",
        scope: "entry", select: `e.id`,
        show: []
    },

    {
        key: "title", label: "Title", group: "Demographics",
        scope: "entry", select: `s.title`,
        show: ["page", "card"]
    },

    {
        key: "method", label: "Experimental method", group: "Demographics",
        scope: "entry", select: `ex.method`,
        show: ["page", "card"]
    },

    // ::text, not the bare DATE: pg turns a DATE into a JS Date and Prague is
    // ahead of UTC, which moved every deposition date back a day.
    {
        key: "deposition_date", label: "Deposition date", group: "Demographics",
        scope: "entry", select: `ds.recvd_initial_deposition_date::text`,
        show: ["page", "card"]
    },

    // 2.00 A and 2 A are different claims: the trailing digits say how
    // precisely the resolution is known.
    {
        key: "resolution", label: "Resolution", group: "Demographics",
        scope: "entry", select: `rf.d_resolution_high`,
        decimals: 2, unit: "Å", show: ["page", "card"]
    },

    // A scalar subquery, not a join: citation_author has a generated id, so two
    // rows can share (entry_id, citation_id, ordinal) and a join would double
    // the entry. The first author only, so all_authors covers it in the rows.
    {
        key: "author", label: "Author name", group: "Demographics",
        scope: "entry",
        show: [],
        select: `(SELECT ca.name FROM citation_author ca
                  WHERE ca.entry_id = e.id AND ca.citation_id = 'primary'
                  ORDER BY ca.ordinal, ca.id LIMIT 1)`
    },

    // Entry scope, not detail: every result card names its authors. The two
    // subqueries cost 2-8 ms for a page of twenty.
    //
    // Falls back to `author`: some entries record only the first, and a missing
    // list should not mean a missing author.
    {
        key: "all_authors", label: "Authors", group: "Citation",
        scope: "entry", fallback: "author", show: ["page", "card"],
        select: `(SELECT string_agg(ca.name, ', ' ORDER BY ca.ordinal, ca.id)
                  FROM citation_author ca
                  WHERE ca.entry_id = e.id AND ca.citation_id = 'primary')`
    },

    {
        key: "published", label: "Published", group: "Citation",
        scope: "entry", show: ["page", "card"],
        select: `(SELECT trim(concat_ws(' ', c.journal_abbrev, c.year::text))
                  FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "polymer_type", label: "Polymer type", group: "Structure Components",
        scope: "entry", select: POLYMER_TYPE_SQL,
        show: ["page", "card"]
    },

    {
        key: "entity_name", label: "Entity name", group: "Structure Components",
        scope: "entry", select: `ent.pdbx_description`,
        show: ["page", "card"]
    },

    // Also a scalar subquery, and not hypothetical: 18 entries have several
    // entity_src_gen rows for entity 1, which joined turned 1,489 into 1,512.
    {
        key: "source_organism", label: "Source organism", group: "Structure Components",
        scope: "entry", show: ["page", "card"],
        select: `COALESCE((SELECT g.pdbx_gene_src_scientific_name FROM entity_src_gen g
                           WHERE g.entry_id = e.id AND g.entity_id = '1'
                           ORDER BY g.id LIMIT 1), '')`
    },

    {
        key: "nonstandard_residue", label: "Non-standard residues",
        group: "Structure Components", scope: "entry",
        show: ["page", "card"],
        select: `COALESCE((
                     SELECT string_agg(DISTINCT cc.id, ', ' ORDER BY cc.id)
                     FROM entity_poly_seq eps
                     JOIN chem_comp cc ON cc.id = eps.mon_id
                     WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n'
                 ), '')`
    },

    {
        key: "confal_score", label: "Overall confal score", group: "3D Features",
        scope: "entry", select: `ntc.confal_score`
    },

    // ORDER BY is not decoration: without it the order is not promised and the
    // same entry could come back differently on different days.
    {
        key: "assigned_ntc", label: "Assigned NtC", group: "3D Features",
        scope: "entry",
        select: `(SELECT string_agg(DISTINCT ss.assigned_ntc, ', ' ORDER BY ss.assigned_ntc)
                  FROM ndb_struct_ntc_step_summary ss
                  WHERE ss.entry_id = e.id)`
    },

    {
        key: "monomer_flag", label: "Monomer standard flag", group: "Structure Components",
        scope: "entry",
        select: `CASE WHEN e.has_nonstandard_residue THEN 'Non-Standard' ELSE 'Standard' END`
    },

    {
        key: "doi", label: "DOI", group: "Citation",
        scope: "detail",
        select: `(SELECT c.pdbx_database_id_doi FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "pubmed", label: "PubMed", group: "Citation",
        scope: "detail",
        select: `(SELECT c.pdbx_database_id_pubmed FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "polymer_composition", label: "Composition", group: "Contents",
        scope: "detail",
        select: `(SELECT string_agg(DISTINCT ep.type, ', ' ORDER BY ep.type)
                  FROM entity_poly ep WHERE ep.entry_id = e.id)`
    },

    {
        key: "chain_count", label: "Chains", group: "Contents",
        scope: "detail",
        select: `(SELECT count(*) FROM struct_asym a WHERE a.entry_id = e.id)::int`
    },

    // The subquery's own alias s shadows the outer struct s. Legal, and it is
    // what the working query says.
    {
        key: "residue_count", label: "Residues", group: "Contents",
        scope: "detail",
        select: `(SELECT count(*) FROM entity_poly_seq s WHERE s.entry_id = e.id)::int`
    },

    {
        key: "atom_count", label: "Atoms", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM atom_site t WHERE t.entry_id = e.id)::int`
    },

    {
        key: "confal_percentile", label: "Confal percentile", group: "3D Features",
        scope: "detail", select: `ntc.confal_percentile`
    },

    {
        key: "ntc_step_count", label: "NtC steps", group: "3D Features",
        scope: "detail", select: `ntc.num_steps`
    },

    // Same question as assigned_ntc without NANT, the marker for an
    // unassigned step, which is not a conformer class.
    {
        key: "ntc_classes", label: "NtC classes", group: "3D Features",
        scope: "detail",
        select: `(SELECT string_agg(DISTINCT ss.assigned_ntc, ', ' ORDER BY ss.assigned_ntc)
                  FROM ndb_struct_ntc_step_summary ss
                  WHERE ss.entry_id = e.id AND ss.assigned_ntc <> 'NANT')`
    }

];


// The columns one view displays, in registry order. `also` names extra keys to
// include, which is how a card gains a row for the thing that was searched on.
export function columns_for(view, also = []) {
    return COLUMNS.filter((c) =>
        (c.show || ["page"]).includes(view) || also.includes(c.key));
}


// The columns that explain why a result matched this query: for every filter
// in use that names one, and that is not on the card already.
export function columns_answering(query) {
    let keys = new Set();

    for (const filter of FILTERS) {
        if (!filter.answered_by) continue;

        let value = query[filter.key];
        if (value !== undefined && value !== "") keys.add(filter.answered_by);
    }

    return [...keys];
}


// What the browser may see. A whitelist, not the object with `where` removed:
// a field added later stays on the server unless it is named here.
export function public_registry() {
    return {
        groups: GROUPS,
        // The URL is worked out here, so the page never has to know which
        // filter an example uses.
        examples: EXAMPLES.map((e) =>
            ({ term: e.term, kind: e.kind, url: example_url(e) })),

        sorts: SORTS.map(({ key, label }) => ({ key, label })),
        default_sort: DEFAULT_SORT.key,

        match_modes: MATCH_MODES,
        default_match: DEFAULT_MATCH,

        page_size_suggestions: PAGE_SIZE_SUGGESTIONS,
        default_page_size: DEFAULT_PAGE_SIZE,
        max_page_size: MAX_PAGE_SIZE,

        filters: FILTERS.map(({ key, label, group, kind, prominent,
                               options, any, placeholder, pair_with }) =>
            ({ key, label, group, kind, prominent,
               options, any, placeholder, pair_with })),

        columns: COLUMNS.map(({ key, label, group, scope, show }) =>
            ({ key, label, group, scope, show })),

        text_filters: TEXT_FILTERS,
        pill_filters: PILL_FILTERS
    };
}
