// filters.js - every question the search can answer and every column it can
// return, as data. Server only: it holds the SQL. The browser gets the safe
// fields from public_registry() via GET /api/fields.

// Asked in the SELECT and in the WHERE, so a result cannot contradict its page.
// One pass over the entry's entity_poly rows sets all four flags. Separate
// EXISTS per flag cost 205 ms a search against 13 for the old two-way split.
// A hybrid strand is both DNA and RNA, so it sets both.
//
// Protein with a nucleic acid is tested first: such an entry also has the
// nucleic acid alone and would otherwise stop there.
export const POLYMER_TYPE_SQL = `(
    SELECT CASE
               WHEN f.protein AND na.part IS NOT NULL THEN 'Protein/' || na.part
               WHEN f.protein AND f.sacc              THEN 'Protein/Oligosaccharide'
               WHEN na.part IS NOT NULL               THEN na.part
               WHEN f.sacc                            THEN 'Oligosaccharide'
               WHEN f.protein                         THEN 'Protein'
               ELSE 'Other'
           END
      FROM (SELECT COALESCE(bool_or(ep.type ILIKE '%polypeptide%'), false) AS protein,
                   COALESCE(bool_or(ep.type ILIKE '%saccharide%'),  false) AS sacc,
                   COALESCE(bool_or(ep.type = 'polydeoxyribonucleotide'
                                 OR ep.type ILIKE '%hybrid%'), false)      AS dna,
                   COALESCE(bool_or(ep.type = 'polyribonucleotide'
                                 OR ep.type ILIKE '%hybrid%'), false)      AS rna
              FROM entity_poly ep WHERE ep.entry_id = e.id) f
      CROSS JOIN LATERAL (SELECT CASE WHEN f.dna AND f.rna THEN 'DNA/RNA'
                                      WHEN f.dna           THEN 'DNA'
                                      WHEN f.rna           THEN 'RNA' END AS part) na
)`;

// The values links used before DNA and RNA were told apart. A bookmark must
// keep finding what it found, so each old value stands for its new ones.
export const POLYMER_TYPE_ALIASES = {
    "Nucleic acid": ["DNA", "RNA", "DNA/RNA"],
    "Protein/NA":   ["Protein/DNA", "Protein/RNA", "Protein/DNA/RNA"]
};

// How many entity names a result shows before "+ N more".
export const ENTITY_NAME_LIMIT = 5;

// One row per distinct polymer description, ranked RNA, DNA, hybrid, then the
// rest, and within a rank by entity id as a number (ids are text: "10" < "2").
const ENTITY_NAME_SQL = `(
    WITH names AS (
        SELECT en.pdbx_description AS name,
               min(CASE ep.type WHEN 'polyribonucleotide'      THEN 1
                                WHEN 'polydeoxyribonucleotide' THEN 2
                                WHEN 'polydeoxyribonucleotide/polyribonucleotide hybrid' THEN 3
                                ELSE 4 END)            AS rank,
               min(lpad(en.id, 10, '0'))               AS first_id
          FROM entity en
          JOIN entity_poly ep ON ep.entry_id = en.entry_id AND ep.entity_id = en.id
         WHERE en.entry_id = e.id AND en.pdbx_description IS NOT NULL
         GROUP BY en.pdbx_description
    ), ranked AS (
        SELECT name, row_number() OVER (ORDER BY rank, first_id) AS n, count(*) OVER () AS total
          FROM names
    )
    SELECT string_agg(name, '; ' ORDER BY n)
           || CASE WHEN max(total) > ${ENTITY_NAME_LIMIT}
                   THEN '; + ' || (max(total) - ${ENTITY_NAME_LIMIT}) || ' more' ELSE '' END
      FROM ranked
     WHERE n <= ${ENTITY_NAME_LIMIT}
)`;

// A pill option is {value, label}; a bare string means the two are the same.
const option = (o) => (typeof o === "string" ? { value: o, label: o } : o);

// The resolution the PDB reports: the one the model was refined to, and the
// data's limit only when no refinement records one. 56 EM entries have it in
// refine alone. Both tables hold at most one row per entry.
export const RESOLUTION_SQL = "COALESCE(rfn.ls_d_res_high, rf.d_resolution_high)";

// The same value for the entry e, with no join needed: for a filter's WHERE.
const RESOLUTION_OF_ENTRY =
    `COALESCE((SELECT rfn.ls_d_res_high FROM refine rfn WHERE rfn.entry_id = e.id),
              (SELECT rf.d_resolution_high FROM reflns rf WHERE rf.entry_id = e.id))`;

// The methods that measure a resolution: diffraction and electron microscopy.
const RESOLUTION_METHODS = ["X-RAY DIFFRACTION", "ELECTRON MICROSCOPY", "NEUTRON DIFFRACTION",
                            "ELECTRON CRYSTALLOGRAPHY", "POWDER DIFFRACTION", "FIBER DIFFRACTION"];

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


// The molecules offered on the landing page and as pills in the panel. An
// entry is one when its own title or one of its molecule names says so, in
// any of `words`, ignoring case. Nothing is inferred: 2DCG is Z-DNA by shape,
// but its title says "left-handed", so it is not counted. Paper titles are
// left out on purpose, since they describe the study rather than the entry
// (9G4P's paper says "tRNA-mimicking"; the entry is not a tRNA). `note` is a
// plain-words label for the landing page and changes nothing that is counted.
export const TOPICS = [
    { value: "tRNA",       words: ["tRNA", "transfer RNA"], note: "carries amino acids" },
    { value: "Ribosome",   words: ["ribosome"],    note: "makes proteins" },
    { value: "Nucleosome", words: ["nucleosome"],  note: "DNA wrapped on histones" },
    { value: "CRISPR",     words: ["CRISPR"],      note: "RNA-guided cutting" },
    { value: "Quadruplex", words: ["quadruplex"],  note: "four-stranded" },
    { value: "Riboswitch", words: ["riboswitch"],  note: "RNA that senses a molecule" },
    { value: "Ribozyme",   words: ["ribozyme"],    note: "RNA that acts as an enzyme" },
    { value: "Aptamer",    words: ["aptamer"],     note: "made to bind a target" },
    { value: "Z-DNA",      words: ["Z-DNA"],       note: "left-handed DNA" }
];

// The ILIKE patterns for chosen topics. An unknown topic adds none, so it
// matches nothing rather than everything.
export function topic_patterns(values) {
    return values.flatMap((v) => TOPICS.find((t) => t.value === v)?.words ?? [])
                 .map((w) => "%" + w.replace(/[\\%_]/g, "\\$&") + "%");
}

// The landing page's three ways in, one question each. Every row is a filter
// link, counted with the very query the link runs (search.js browse_counts),
// so a row and its results cannot disagree. Made of and method each cover
// every entry once: an entry has one polymer type and one method.
const browse_row = (label, key, values, note = null) =>
    ({ label, note, params: { [key]: values },
       url: "/search?" + key + "=" + values.map(encodeURIComponent).join(",") });

export const BROWSE = [
    { question: "What is it made of?", hint: "The molecules in the entry", rows: [
        browse_row("DNA", "polymer_type", ["DNA"]),
        browse_row("RNA", "polymer_type", ["RNA"]),
        browse_row("DNA and RNA", "polymer_type", ["DNA/RNA"]),
        browse_row("Protein with DNA", "polymer_type", ["Protein/DNA"]),
        browse_row("Protein with RNA", "polymer_type", ["Protein/RNA"]),
        browse_row("Protein with DNA and RNA", "polymer_type", ["Protein/DNA/RNA"])
    ] },
    { question: "Which molecule?", hint: "Named in its title or a molecule",
      rows: TOPICS.map((t) => browse_row(t.value, "topic", [t.value], t.note)) },
    { question: "How was it solved?", hint: "The experimental method", rows: [
        browse_row("X-ray", "experimental_method", ["X-RAY DIFFRACTION"]),
        browse_row("Electron microscopy", "experimental_method", ["ELECTRON MICROSCOPY"]),
        browse_row("NMR", "experimental_method", ["SOLUTION NMR", "SOLID-STATE NMR"])
    ] }
];

// One object per searchable question. `kind` decides how the value is read and
// drawn; `where` is SQL with ? for the value; `clause` is the escape hatch for
// a filter whose SQL takes no parameter. Never rename a key: bookmarks use it.
// The SQL half of the search box's loose matching: the same punctuation the
// browser drops from what was typed, dropped from the column being searched.
// Spaces are kept on both sides. See like_normalised in search.js.
const normalised = (column) =>
    `regexp_replace(lower(${column}), '[^a-z0-9 ]', '', 'g')`;

// Every source organism of an entry, whichever way each molecule was made
// (db/migrations/012): name, taxon ID and entity, one row each.
export const SOURCES_SQL = `(SELECT g.entry_id, g.entity_id, g.pdbx_gene_src_scientific_name AS organism,
                             g.pdbx_gene_src_ncbi_taxonomy_id AS taxid
                        FROM entity_src_gen g
                      UNION ALL
                      SELECT n.entry_id, n.entity_id, n.pdbx_organism_scientific, n.pdbx_ncbi_taxonomy_id
                        FROM entity_src_nat n
                      UNION ALL
                      SELECT y.entry_id, y.entity_id, y.organism_scientific, y.ncbi_taxonomy_id
                        FROM pdbx_entity_src_syn y)`;

// The source tables by the word the Source section uses for them.
const SOURCE_TABLES = { Natural: "entity_src_nat", Expressed: "entity_src_gen",
                        Synthetic: "pdbx_entity_src_syn" };
const has_source = (table) => `EXISTS (SELECT 1 FROM ${table} t WHERE t.entry_id = e.id)`;
// A polymer with none of the three: 401 of 15,891, in 261 entries.
const UNSOURCED_SQL = `EXISTS (SELECT 1 FROM entity en
                               WHERE en.entry_id = e.id AND en.type = 'polymer'
                                 AND NOT EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                                                 WHERE s.entry_id = en.entry_id
                                                   AND s.entity_id = en.id))`;

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
        // Matched word by word, each word in this clause: see search_units.
        words: true,
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
        //
        // residues holds each non-standard residue's code and its chemical
        // name, so PSU finds the 90 entries holding pseudouridine and so does
        // pseudouridine. Matched loosely, not as a whole code: a whole-code
        // match is a subset of a loose one, so pairing the two would add
        // nothing, and loose is what makes the chemical names reachable.
        // Measured: of nineteen ordinary searches only 5M moves much, 21 to
        // 108, and those really are 5MU and 5MC structures.
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND (   d.id       ILIKE ?
                                   OR d.entities ILIKE ?
                                   OR d.residues ILIKE ?
                                   OR d.prose    LIKE  ?~
                                   OR d.id IN (SELECT s.entry_id FROM ${SOURCES_SQL} s
                                               WHERE s.taxid = ANY(?@))))`
    },

    // The only filter on a column of `entry` itself. ILIKE because plain LIKE
    // and = are case-sensitive in PostgreSQL, unlike MySQL.
    {
        key: "entry_id", label: "Entry ID", group: "Demographics", kind: "text",
        where: `AND e.id ILIKE ?`
    },

    {
        // Every word in one author's name, in any order: names are stored
        // as "Sponer, J.", and people type "J. Sponer" or "Sponer J".
        key: "author_name", label: "Author name", group: "Demographics", kind: "text",
        each_word: true,
        where: `AND EXISTS (SELECT 1 FROM citation_author ca
                            WHERE ca.entry_id = e.id
                              AND ca.citation_id = 'primary'
                              AND ca.name ILIKE ALL (?))`
    },

    // = ANY(?) takes the whole array as one parameter, however many pills are
    // on. IN (...) would need a changing number of placeholders.
    //
    // `first`: how many options are always shown. The rest wait behind a
    // "more" button, since 99.9% of entries use the first four.
    {
        key: "experimental_method", label: "Experimental method",
        group: "Demographics", kind: "pills", any: true, first: 4,
        options: [
            { value: "X-RAY DIFFRACTION",        label: "X-ray" },
            { value: "ELECTRON MICROSCOPY",      label: "EM" },
            { value: "SOLUTION NMR",             label: "NMR" },
            { value: "SOLID-STATE NMR",          label: "Solid NMR" },
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

    // The resolution as the cards show it (RESOLUTION_OF_ENTRY), between two
    // values in Å, both ends included. The form shows it only once a method
    // that reports a resolution is picked (`revealed_by`); NMR has none, so an
    // NMR entry never passes a resolution range.
    {
        key: "resolution_min", label: "Resolution (Å)", group: "Demographics", kind: "range",
        answered_by: "resolution", placeholder: "from, e.g. 2.0", pair_with: "resolution_max",
        revealed_by: { key: "experimental_method", values: RESOLUTION_METHODS },
        where: `AND ${RESOLUTION_OF_ENTRY} >= ?`
    },
    {
        key: "resolution_max", label: "Resolution (Å)", group: "Demographics", kind: "range",
        answered_by: "resolution", placeholder: "to, e.g. 3.0",
        where: `AND ${RESOLUTION_OF_ENTRY} <= ?`
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
        // A class is four characters (AA00, NANT). Anything much longer cannot
        // match, and scanning a million steps to say so ran into the 15 s
        // statement timeout for a pasted paragraph.
        max_length: 8,
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

    // The organism a molecule comes from, never the host it was made in:
    // Escherichia coli is a source in 189 entries and a host in 816.
    {
        key: "source_organism", label: "Source organism",
        group: "Structure Components", kind: "text", suggest: "source_organisms",
        placeholder: "e.g. mouse or Mus musculus",
        // Or any taxon the text names (taxonomy.js): mouse, E. coli, yeast.
        // IN, not = ANY(ARRAY(...)): the ids are hashed once per search instead
        // of scanned per entry: 12 ms rather than 185 for Bacteria.
        where: `AND (EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                             WHERE s.entry_id = e.id
                               AND s.organism ILIKE ?)
                  OR e.id IN (SELECT s.entry_id FROM ${SOURCES_SQL} s
                                      WHERE s.taxid = ANY(?@)))`
    },

    // Exact: 562 is Escherichia coli and not its strains, so 1OB5's host
    // BL21(DE3), 469008, is not found by it. Nothing local knows the tree.
    {
        key: "taxonomy_id", label: "Taxonomy ID",
        group: "Structure Components", kind: "number", answered_by: "source_taxonomy",
        placeholder: "e.g. 4932",
        where: `AND EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                            WHERE s.entry_id = e.id AND s.taxid = ?)`
    },

    // How the molecules were obtained. Any pill an entry has matches; an
    // entry with a natural tRNA and an expressed protein answers both.
    {
        key: "source_kind", label: "Obtained", answered_by: "source_kind",
        group: "Structure Components", kind: "pills", any: true,
        options: ["Natural", "Expressed", "Synthetic", "Not recorded"].map(option),
        clause: (v) => {
            let tests = v.filter((k) => k in SOURCE_TABLES || k === "Not recorded")
                         .map((k) => (k === "Not recorded" ? UNSOURCED_SQL : has_source(SOURCE_TABLES[k])));
            return tests.length ? `AND (${tests.join(" OR ")})` : null;
        }
    },

    {
        key: "expression_host", label: "Expression host", answered_by: "expression_host",
        group: "Structure Components", kind: "text", suggest: "expression_hosts",
        placeholder: "e.g. E. coli or human",
        // Or any taxon the text names, as for the source organism.
        where: `AND (EXISTS (SELECT 1 FROM entity_src_gen g
                             WHERE g.entry_id = e.id
                               AND g.pdbx_host_org_scientific_name ILIKE ?)
                  OR e.id IN (SELECT g.entry_id FROM entity_src_gen g
                                      WHERE g.pdbx_host_org_ncbi_taxonomy_id = ANY(?@)))`
    },

    // Matches the residue code as well as its name, because a code is what
    // people type. Nucleic acid chains only, like the monomer flag: MSE is a
    // protein label. The codes each entry holds come ready made from the doc
    // view (its residue_codes, the list the cards show), so this compares two
    // short lists rather than reading 800,000 residue rows: 3 ms, not 400.
    // Same answer as reading the residues for all 225 inputs tried.
    {
        key: "nonstandard_residue", label: "Non-standard residue",
        group: "Structure Components", kind: "text",
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND string_to_array(d.residue_codes, ', ') && ARRAY(
                                  SELECT cc.id::text FROM chem_comp cc
                                  WHERE cc.mon_nstd_flag = 'n'
                                    AND (cc.id ILIKE ? OR cc.name ILIKE ?)))`
    },

    // A code is matched whole, since one or two letters would otherwise find
    // half the database: K is potassium, not every name holding a k. A name
    // is matched loosely, from three letters up, so adenosyl finds SAM and SAH.
    // ? is %value%, so its length is the typed length plus two.
    {
        key: "ligand", label: "Ligand", answered_by: "ligands",
        group: "Structure Components", kind: "text", suggest: "ligands",
        placeholder: "e.g. SAM or adenosyl",
        where: `AND EXISTS (SELECT 1 FROM pdbx_entity_nonpoly n
                            WHERE n.entry_id = e.id
                              AND n.comp_id = ANY (ARRAY(
                                  SELECT cc.id FROM chem_comp cc
                                  WHERE cc.id <> 'HOH'
                                    AND (   upper(cc.id) = upper(substr(?, 2, length(?) - 2))
                                         OR (length(?) >= 5 AND cc.name ILIKE ?)))))`
    },

    // See TOPICS. Both ? are the one array of patterns.
    {
        key: "topic", label: "Molecule",
        group: "Structure Components", kind: "pills", any: true,
        options: TOPICS.map((t) => option(t.value)),
        expand: topic_patterns,
        where: `AND (EXISTS (SELECT 1 FROM struct st
                             WHERE st.entry_id = e.id AND st.title ILIKE ANY(?))
                  OR EXISTS (SELECT 1 FROM entity ent
                             WHERE ent.entry_id = e.id AND ent.pdbx_description ILIKE ANY(?)))`
    },

    {
        key: "polymer_type", label: "Polymer type",
        group: "Structure Components", kind: "pills", any: true,
        options: ["DNA", "RNA", "DNA/RNA",
                  "Protein/DNA", "Protein/RNA", "Protein/DNA/RNA",
                  "Protein", "Oligosaccharide", "Protein/Oligosaccharide", "Other"].map(option),
        expand: (values) => values.flatMap((v) => POLYMER_TYPE_ALIASES[v] || [v]),
        where: `AND (${POLYMER_TYPE_SQL}) = ANY(?)`,
        // Each pill shows how many entries it finds; one that finds none is
        // not drawn. Every entry holds a nucleic acid, so Protein alone is 0.
        count_by: POLYMER_TYPE_SQL
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

export const TEXT_FILTERS = of_kind("text", "range", "number");
export const PILL_FILTERS = of_kind("pills");


// The orders the results can be put in. `join` is what the paging query needs
// in scope to see the column, and `sql` is the ORDER BY. e.id is appended as a
// tiebreaker: 1,489 entries share only 292 resolutions, and without a unique
// last key a tied row can land on two pages or on none. `unique: true` says a
// column is already unique and needs no tiebreaker.
//
// NULLS LAST in both directions, because a missing value is not a small one:
// 629 structures have no resolution, and they belong at the end either way.
// RESOLUTION_SQL is near the top, beside the resolution filter.
const RESOLUTION_JOIN = `LEFT JOIN reflns rf  ON rf.entry_id  = e.id
                         LEFT JOIN refine rfn ON rfn.entry_id = e.id`;

export const SORTS = [
    // Ranked by how well an entry answers the search box (search.js,
    // best_match); with nothing typed every entry ties and it is id order.
    {
        key: "best", label: "Best match",
        join: "", sql: "e.id ASC", unique: true, ranked: true
    },
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
        join: RESOLUTION_JOIN,
        sql: `${RESOLUTION_SQL} ASC NULLS LAST`
    },
    {
        key: "resolution_desc", label: "Resolution, worst first",
        join: RESOLUTION_JOIN,
        sql: `${RESOLUTION_SQL} DESC NULLS LAST`
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
export const DEFAULT_SORT = SORTS.find((s) => s.key === "best");

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
        scope: "entry", select: RESOLUTION_SQL,
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

    // Every polymer, nucleic acids first: 1,406 entries have more than one,
    // and in 786 entity 1 is a protein. Capped so a ribosome's 100 names do
    // not fill the card; the molecule table lists them all.
    {
        key: "entity_name", label: "Entity name", group: "Structure Components",
        scope: "entry", select: ENTITY_NAME_SQL,
        show: ["card"]
    },

    // A scalar subquery, and not hypothetical: 18 entries have several source
    // rows for entity 1, which joined turned 1,489 into 1,512.
    {
        // Every entity's organism, however it was made: 1OB5 is a yeast tRNA
        // purified from cells on a Thermus protein. Names that differ only in
        // case are one organism, spelt the way that is not all capitals.
        key: "source_organism", label: "Source organism", group: "Structure Components",
        scope: "entry", show: ["card"], empty: "Not recorded", species: true,
        select: `COALESCE((
                     SELECT string_agg(o.name, '; ' ORDER BY o.first)
                     FROM (SELECT (array_agg(trim(s.organism)
                                             ORDER BY s.organism = upper(s.organism),
                                                      lpad(s.entity_id, 10, '0')))[1] AS name,
                                  min(lpad(s.entity_id, 10, '0')) AS first
                             FROM ${SOURCES_SQL} s
                            WHERE s.entry_id = e.id
                              AND trim(s.organism) <> ''
                            GROUP BY lower(trim(s.organism))) o
                 ), '')`
    },

    // Shown on a card only when its filter was used, to say why it matched.
    {
        key: "source_taxonomy", label: "Taxonomy ID", group: "Structure Components",
        scope: "entry", show: [],
        select: `(SELECT string_agg(DISTINCT s.taxid::text, ', ')
                  FROM ${SOURCES_SQL} s WHERE s.entry_id = e.id)`
    },

    {
        key: "source_kind", label: "Obtained", group: "Structure Components",
        scope: "entry", show: [],
        select: `concat_ws(', ',
                     CASE WHEN ${has_source("entity_src_nat")} THEN 'Natural' END,
                     CASE WHEN ${has_source("entity_src_gen")} THEN 'Expressed' END,
                     CASE WHEN ${has_source("pdbx_entity_src_syn")} THEN 'Synthetic' END,
                     CASE WHEN ${UNSOURCED_SQL} THEN 'Not recorded' END)`
    },

    {
        key: "expression_host", label: "Expression host", group: "Structure Components",
        scope: "entry", show: [], species: true,
        select: `(SELECT string_agg(DISTINCT trim(g.pdbx_host_org_scientific_name), '; ')
                  FROM entity_src_gen g
                  WHERE g.entry_id = e.id AND trim(g.pdbx_host_org_scientific_name) <> '')`
    },

    // Stored in doc by migration 011: worked out here it cost 1.6 s an export.
    {
        key: "nonstandard_residue", label: "Non-standard residues",
        group: "Structure Components", scope: "entry",
        show: ["page", "card"],
        select: `COALESCE((SELECT d.residue_codes FROM doc d WHERE d.id = e.id), '')`
    },

    // Water left out: it is in nearly every crystal and says nothing.
    {
        key: "ligands", label: "Ligands",
        group: "Structure Components", scope: "entry",
        show: ["page", "card"],
        select: `(SELECT string_agg(DISTINCT n.comp_id, ', ' ORDER BY n.comp_id)
                  FROM pdbx_entity_nonpoly n
                  WHERE n.entry_id = e.id AND n.comp_id <> 'HOH')`
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
        // DISTINCT in a subquery, not inside string_agg: that one sorts every
        // step (thousands per ribosome), this one hashes them. Twice as fast.
        select: `(SELECT string_agg(c, ', ' ORDER BY c)
                  FROM (SELECT DISTINCT ss.assigned_ntc AS c
                        FROM ndb_struct_ntc_step_summary ss
                        WHERE ss.entry_id = e.id) d)`
    },

    {
        key: "monomer_flag", label: "Monomer standard flag", group: "Structure Components",
        scope: "entry",
        select: `CASE WHEN e.has_nonstandard_residue THEN 'Non-Standard' ELSE 'Standard' END`
    },

    // Not on the page as text: the Citations list there links them, for every
    // citation and not only the primary. Still in the report and the CSV.
    {
        key: "doi", label: "DOI", group: "Citation",
        scope: "detail", show: [],
        select: `(SELECT c.pdbx_database_id_doi FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "pubmed", label: "PubMed", group: "Citation",
        scope: "detail", show: [],
        select: `(SELECT c.pdbx_database_id_pubmed FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "polymer_composition", label: "Composition", group: "Contents",
        scope: "detail", show: [],
        select: `(SELECT string_agg(DISTINCT ep.type, ', ' ORDER BY ep.type)
                  FROM entity_poly ep WHERE ep.entry_id = e.id)`
    },

    {
        key: "chain_count", label: "Chains", group: "Contents",
        scope: "detail",
        // Polymer chains only: struct_asym also has a row per ligand and per
        // water, 77,095 of its 97,441 rows, so 2VON showed 8 chains for 4.
        select: `(SELECT count(*) FROM struct_asym a
                    JOIN entity en ON en.entry_id = a.entry_id AND en.id = a.entity_id
                   WHERE a.entry_id = e.id AND en.type = 'polymer')::int`
    },

    // Per chain, from pdbx_poly_seq_scheme: entity_poly_seq has one row per
    // residue per entity, so 2VON's two copies of each chain read 200 for 400.
    // Distinct positions, because a microheterogeneous one has a row per
    // alternative residue. The alias s shadows the outer struct s; legal.
    {
        key: "residue_count", label: "Residues", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM (SELECT DISTINCT s.asym_id, s.seq_id
                                          FROM pdbx_poly_seq_scheme s
                                         WHERE s.entry_id = e.id) r)::int`
    },

    // Residues counts protein too, which hides the nucleic acid: 2VON has 400
    // residues and 14 nucleotides. Same rules, DNA, RNA and hybrid chains only.
    {
        key: "nucleotide_count", label: "Nucleotides", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM (SELECT DISTINCT s.asym_id, s.seq_id
                                          FROM pdbx_poly_seq_scheme s
                                          JOIN entity_poly ep ON ep.entry_id = s.entry_id
                                                             AND ep.entity_id = s.entity_id
                                         WHERE s.entry_id = e.id
                                           AND ep.type ILIKE '%nucleotide%') r)::int`
    },

    // One copy of the structure: an NMR entry stores every model (136D has 14,
    // 11,158 rows for 797 atoms), and water is solvent, not the molecule.
    // Every entry's models start at 1; HOH is the only water code loaded, DOD
    // covers neutron structures.
    {
        key: "atom_count", label: "Atoms", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM atom_site t
                   WHERE t.entry_id = e.id
                     AND t.pdbx_pdb_model_num = 1
                     AND t.label_comp_id NOT IN ('HOH', 'DOD'))::int`
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
        select: `(SELECT string_agg(c, ', ' ORDER BY c)
                  FROM (SELECT DISTINCT ss.assigned_ntc AS c
                        FROM ndb_struct_ntc_step_summary ss
                        WHERE ss.entry_id = e.id AND ss.assigned_ntc <> 'NANT') d)`
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
        sorts: SORTS.map(({ key, label }) => ({ key, label })),
        default_sort: DEFAULT_SORT.key,

        match_modes: MATCH_MODES,
        default_match: DEFAULT_MATCH,

        page_size_suggestions: PAGE_SIZE_SUGGESTIONS,
        default_page_size: DEFAULT_PAGE_SIZE,
        max_page_size: MAX_PAGE_SIZE,

        filters: FILTERS.map(({ key, label, group, kind, prominent, options, any, first,
                               placeholder, pair_with, revealed_by, suggest }) =>
            ({ key, label, group, kind, prominent, options, any, first,
               placeholder, pair_with, revealed_by, suggest })),

        columns: COLUMNS.map(({ key, label, group, scope, show }) =>
            ({ key, label, group, scope, show })),

        text_filters: TEXT_FILTERS,
        pill_filters: PILL_FILTERS
    };
}
