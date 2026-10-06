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
              "conformer classes such as AA00. Both come from DNATCO; two " +
              "structures have no score."
    },
    { name: "Structure Components", slug: "components" }
];


// One object per searchable question. `kind` decides how the value is read and
// drawn; `where` is SQL with ? for the value; `clause` is the escape hatch for
// a filter whose SQL takes no parameter. Never rename a key: bookmarks use it.
export const FILTERS = [
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
        placeholder: "min", pair_with: "confal_max",
        where: `AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                            WHERE o.entry_id = e.id AND o.confal_score >= ?)`
    },

    {
        key: "confal_max", label: "Confal score", group: "3D Features", kind: "range",
        placeholder: "max",
        where: `AND EXISTS (SELECT 1 FROM ndb_struct_ntc_overall o
                            WHERE o.entry_id = e.id AND o.confal_score <= ?)`
    },

    {
        key: "assigned_ntc", label: "Assigned NtC", group: "3D Features", kind: "text",
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
        group: "Structure Components", kind: "pills", any: false,
        options: ["Standard", "Non-Standard"].map(option),
        clause: (v) => {
            if (v.length !== 1) return null;
            if (v[0] === "Non-Standard") return "AND e.has_nonstandard_residue";
            if (v[0] === "Standard")     return "AND NOT e.has_nonstandard_residue";
            return null;
        }
    }
];

// A range value arrives from a URL as a single string, like a text one.
const of_kind = (...kinds) =>
    FILTERS.filter((f) => kinds.includes(f.kind)).map((f) => f.key);

export const TEXT_FILTERS = of_kind("text", "range");
export const PILL_FILTERS = of_kind("pills");


// One object per returnable column. A separate list from FILTERS because the
// two overlap without containing each other: `title` is shown and not searched.
// scope "entry" is fetched for every result, "detail" only for one entry.
// in_detail: false keeps a fetched column out of the detail rows.
export const COLUMNS = [
    // Fetched for the panel's links, but the heading already shows it.
    {
        key: "pdb_id", label: "Entry ID", group: "Demographics",
        scope: "entry", select: `e.id`,
        in_detail: false
    },

    {
        key: "title", label: "Title", group: "Demographics",
        scope: "entry", select: `s.title`
    },

    // A scalar subquery, not a join: citation_author has a generated id, so two
    // rows can share (entry_id, citation_id, ordinal) and a join would double
    // the entry. The first author only, so all_authors covers it in the rows.
    {
        key: "author", label: "Author name", group: "Demographics",
        scope: "entry",
        in_detail: false,
        select: `(SELECT ca.name FROM citation_author ca
                  WHERE ca.entry_id = e.id AND ca.citation_id = 'primary'
                  ORDER BY ca.ordinal, ca.id LIMIT 1)`
    },

    {
        key: "method", label: "Experimental method", group: "Demographics",
        scope: "entry", select: `ex.method`
    },

    // ::text, not the bare DATE: pg turns a DATE into a JS Date and Prague is
    // ahead of UTC, which moved every deposition date back a day.
    {
        key: "deposition_date", label: "Deposition date", group: "Demographics",
        scope: "entry", select: `ds.recvd_initial_deposition_date::text`
    },

    // 2.00 A and 2 A are different claims: the trailing digits say how
    // precisely the resolution is known.
    {
        key: "resolution", label: "Resolution", group: "Demographics",
        scope: "entry", select: `rf.d_resolution_high`,
        decimals: 2, unit: "Å"
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
        key: "entity_name", label: "Entity name", group: "Structure Components",
        scope: "entry", select: `ent.pdbx_description`
    },

    // Also a scalar subquery, and not hypothetical: 18 entries have several
    // entity_src_gen rows for entity 1, which joined turned 1,489 into 1,512.
    {
        key: "source_organism", label: "Source organism", group: "Structure Components",
        scope: "entry",
        select: `COALESCE((SELECT g.pdbx_gene_src_scientific_name FROM entity_src_gen g
                           WHERE g.entry_id = e.id AND g.entity_id = '1'
                           ORDER BY g.id LIMIT 1), '')`
    },

    {
        key: "nonstandard_residue", label: "Non-standard residues",
        group: "Structure Components", scope: "entry",
        select: `COALESCE((
                     SELECT string_agg(DISTINCT cc.id, ', ' ORDER BY cc.id)
                     FROM entity_poly_seq eps
                     JOIN chem_comp cc ON cc.id = eps.mon_id
                     WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n'
                 ), '')`
    },

    {
        key: "polymer_type", label: "Polymer type", group: "Structure Components",
        scope: "entry", select: POLYMER_TYPE_SQL
    },

    {
        key: "monomer_flag", label: "Monomer standard flag", group: "Structure Components",
        scope: "entry",
        select: `CASE WHEN e.has_nonstandard_residue THEN 'Non-Standard' ELSE 'Standard' END`
    },

    // Falls back to `author`: some entries record only the first, and a missing
    // list should not mean a missing author.
    {
        key: "all_authors", label: "Authors", group: "Citation",
        scope: "detail", fallback: "author",
        select: `(SELECT string_agg(ca.name, ', ' ORDER BY ca.ordinal, ca.id)
                  FROM citation_author ca
                  WHERE ca.entry_id = e.id AND ca.citation_id = 'primary')`
    },

    {
        key: "published", label: "Published", group: "Citation",
        scope: "detail",
        select: `(SELECT trim(concat_ws(' ', c.journal_abbrev, c.year::text))
                  FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
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


// What the browser may see. A whitelist, not the object with `where` removed:
// a field added later stays on the server unless it is named here.
export function public_registry() {
    return {
        groups: GROUPS,

        filters: FILTERS.map(({ key, label, group, kind,
                               options, any, placeholder, pair_with }) =>
            ({ key, label, group, kind, options, any, placeholder, pair_with })),

        columns: COLUMNS.map(({ key, label, group, scope }) =>
            ({ key, label, group, scope })),

        text_filters: TEXT_FILTERS,
        pill_filters: PILL_FILTERS
    };
}
