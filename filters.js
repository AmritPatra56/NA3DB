
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

// Old polymer_type values, kept so bookmarks still work.
export const POLYMER_TYPE_ALIASES = {
    "Nucleic acid": ["DNA", "RNA", "DNA/RNA"],
    "Protein/NA":   ["Protein/DNA", "Protein/RNA", "Protein/DNA/RNA"]
};

export const ENTITY_NAME_LIMIT = 5;

// Entity ids are text, so they are compared as numbers.
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

const option = (o) => (typeof o === "string" ? { value: o, label: o } : o);

// Same rule as RCSB's resolution_combined.
export const RESOLUTION_SQL =
    `COALESCE((SELECT COALESCE(min(em.resolution) FILTER (WHERE em.resolution_method = 'FSC 0.143 CUT-OFF'),
                               min(em.resolution))
                 FROM em_3d_reconstruction em WHERE em.entry_id = e.id),
              (SELECT rfn.ls_d_res_high FROM refine rfn WHERE rfn.entry_id = e.id),
              (SELECT rf.d_resolution_high FROM reflns rf WHERE rf.entry_id = e.id))`;

const band = (method, short, lo, hi) => {
    let words = hi === null ? `${lo} Å or worse` : lo === 0 ? `better than ${hi} Å` : `${lo} to ${hi} Å`;
    return {
        value: `${method}:${hi === null ? `${lo} and over` : lo === 0 ? `under ${hi}` : `${lo}-${hi}`}`,
        label: `${short} ${words}`, short: words[0].toUpperCase() + words.slice(1),
        method, lo, hi: hi ?? "'Infinity'::numeric"
    };
};
const bands_of = (method, short, edges) =>
    edges.slice(0, -1).map((lo, i) => band(method, short, lo, edges[i + 1]));
export const RESOLUTION_BANDS = {
    "X-RAY DIFFRACTION":   bands_of("X-RAY DIFFRACTION", "X-ray", [0, 1.5, 2, 2.5, 3, 4, null]),
    "ELECTRON MICROSCOPY": bands_of("ELECTRON MICROSCOPY", "EM", [0, 2.5, 3, 3.5, 4, 6, null])
};
const ALL_BANDS = Object.values(RESOLUTION_BANDS).flat();

const METHOD_OPTIONS = [
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
].map(option);
const METHOD_VALUES = METHOD_OPTIONS.map((o) => o.value);

const RESOLUTION_METHODS = ["X-RAY DIFFRACTION", "ELECTRON MICROSCOPY", "NEUTRON DIFFRACTION",
                            "ELECTRON CRYSTALLOGRAPHY", "POWDER DIFFRACTION", "FIBER DIFFRACTION"];

export const GROUPS = [
    { name: "Demographics", slug: "demographics" },
    {
        name: "3D Features", slug: "features",
        note: "Confal score runs 0 to 96, and NtC assignment is one of 97 " +
              "conformer classes such as AA00. Both come from DNATCO."
    },
    { name: "Structure Components", slug: "components" }
];

export const MODIFICATIONS = [
    { value: "Nm",            label: "2′-O-methyl (Nm)",         codes: ["OMG", "OMC", "OMU", "A2M"] },
    { value: "Pseudouridine", label: "Pseudouridine (Ψ)",        codes: ["PSU"] },
    { value: "m5C",           label: "5-methylcytidine (m⁵C)",   codes: ["5MC"] },
    { value: "m7G",           label: "7-methylguanosine (m⁷G)",  codes: ["G7M", "7MG"] },
    { value: "m6A",           label: "N⁶-methyladenosine (m⁶A)", codes: ["6MZ"] },
    { value: "5-methyl-dC",   label: "5-methyl-dC, in DNA",      codes: ["5CM"] }
];

export const modification_codes = (values) =>
    values.flatMap((v) => MODIFICATIONS.find((m) => m.value === v)?.codes ?? []);

export const browse_row = (label, key, values, note = null, say = null) =>
    ({ label, note, say, params: { [key]: values },
       url: "/search?" + key + "=" + values.map(encodeURIComponent).join(",") });
const in_sentence = (text) => text[0].toLowerCase() + text.slice(1);
const browse_ask = (label, key, yes, more = {}) => {
    let no = more.no ? { key, values: more.no } : { key: "not_" + key, values: yes };
    return {
        label, note: null,
        say_yes: more.no ? in_sentence(label) : label, say_no: more.no ? `not ${in_sentence(label)}` : label,
        ...more,
        params: { [key]: yes }, no_params: { [no.key]: no.values },
        url: browse_row(label, key, yes).url, no_url: browse_row(label, no.key, no.values).url
    };
};
const band_choices = (method) => RESOLUTION_BANDS[method].map((b) =>
    browse_row(b.short, "experimental_method", [b.value], null, b.label));

export const BROWSE = [
    { area: "made", question: "What is it made of?", hint: "The molecules in the entry", rows: [
        browse_ask("DNA", "polymer_type", ["DNA"]),
        browse_ask("RNA", "polymer_type", ["RNA"]),
        browse_ask("DNA and RNA", "polymer_type", ["DNA/RNA"]),
        browse_ask("Protein with DNA", "polymer_type", ["Protein/DNA"]),
        browse_ask("Protein with RNA", "polymer_type", ["Protein/RNA"]),
        browse_ask("Protein with DNA and RNA", "polymer_type", ["Protein/DNA/RNA"])
    ] },
    { area: "from", question: "Where is it from?", hint: "The organism of any of its molecules", rows: [
        browse_ask("Eukaryotes", "source_organism", ["Eukaryota"], { within: "Eukaryota" }),
        browse_ask("Bacteria", "source_organism", ["Bacteria"], { within: "Bacteria" }),
        browse_ask("Archaea", "source_organism", ["Archaea"], { within: "Archaea" }),
        browse_ask("Viruses", "source_organism", ["Viruses"], { within: "Viruses" }),
        browse_ask("Chemically synthesised", "synthetic", ["Synthetic"], { no: ["Not synthetic"] })
    ], foot: { text: "A human protein on synthetic DNA counts under both." } },
    { area: "method", question: "How was it solved?", hint: "The experimental method", rows: [
        browse_ask("X-ray", "experimental_method", ["X-RAY DIFFRACTION"],
                   { choices: band_choices("X-RAY DIFFRACTION"), options_name: "Resolution" }),
        browse_ask("Electron microscopy", "experimental_method", ["ELECTRON MICROSCOPY"],
                   { choices: band_choices("ELECTRON MICROSCOPY"), options_name: "Resolution" }),
        browse_ask("NMR", "experimental_method", ["SOLUTION NMR", "SOLID-STATE NMR"], { choices: [
            browse_row("Solution", "experimental_method", ["SOLUTION NMR"], null, "Solution NMR"),
            browse_row("Solid-state", "experimental_method", ["SOLID-STATE NMR"], null, "Solid-state NMR")
        ], options_name: "Kind" })
    ] },
    { area: "modified", question: "Is it modified?", hint: "Chemically modified nucleotides", rows: [
        browse_ask("Modified nucleotides", "monomer_flag", ["Non-Standard"],
                   { no: ["Standard"], say_yes: "modified", say_no: "not modified", top: "nonstandard_residue" })
    ], foot: { text: "An entry with several modifications counts under each." } },
    { area: "bound", question: "What is bound to it?", hint: "Ions, small molecules and water", rows: [
        browse_ask("Ligands", "has_ligand", ["With ligands"],
                   { no: ["Without ligands"], say_yes: "with ligands", say_no: "without ligands", top: "ligand" }),
        browse_ask("Water", "has_water", ["With water"],
                   { no: ["Without water"], say_yes: "with water", say_no: "without water" })
    ], foot: { text: "Manganese, spermine and more from the search box. An entry with several counts under each." } }
];

// Never rename a key: bookmarks use it.
const normalised = (column) =>
    `regexp_replace(lower(${column}), '[^a-z0-9 ]', '', 'g')`;

export const SOURCES_SQL = `(SELECT g.entry_id, g.entity_id, g.pdbx_gene_src_scientific_name AS organism,
                             g.pdbx_gene_src_ncbi_taxonomy_id AS taxid
                        FROM entity_src_gen g
                      UNION ALL
                      SELECT n.entry_id, n.entity_id, n.pdbx_organism_scientific, n.pdbx_ncbi_taxonomy_id
                        FROM entity_src_nat n
                      UNION ALL
                      SELECT y.entry_id, y.entity_id, y.organism_scientific, y.ncbi_taxonomy_id
                        FROM pdbx_entity_src_syn y)`;

const SOURCE_TABLES = { Natural: "entity_src_nat", Expressed: "entity_src_gen",
                        Synthetic: "pdbx_entity_src_syn" };
const has_source = (table) => `EXISTS (SELECT 1 FROM ${table} t WHERE t.entry_id = e.id)`;
const UNSOURCED_SQL = `EXISTS (SELECT 1 FROM entity en
                               WHERE en.entry_id = e.id AND en.type = 'polymer'
                                 AND NOT EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                                                 WHERE s.entry_id = en.entry_id
                                                   AND s.entity_id = en.id))`;

export const FILTERS = [
    // No index on struct.title: a scan of 1,489 titles takes 2.9 ms.
    {
        key: "q", label: "Search", group: "Demographics", kind: "text",
        prominent: true,
        negatable: "match",
        words: true,
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND (   d.id       ILIKE ?
                                   OR d.entities ILIKE ?
                                   OR d.residues ILIKE ?
                                   OR d.prose    LIKE  ?~
                                   OR d.id IN (SELECT s.entry_id FROM ${SOURCES_SQL} s
                                               WHERE s.taxid = ANY(?@))))`
    },

    // ILIKE: LIKE is case-sensitive in PostgreSQL.
    {
        key: "entry_id", label: "Entry ID", group: "Demographics", kind: "text",
        where: `AND e.id ILIKE ?`
    },

    {
        // Names are stored "Sponer, J."; people type "J. Sponer".
        key: "author_name", label: "Author name", group: "Demographics", kind: "text",
        each_word: true,
        where: `AND EXISTS (SELECT 1 FROM citation_author ca
                            WHERE ca.entry_id = e.id
                              AND ca.citation_id = 'primary'
                              AND ca.name ILIKE ALL (?))`
    },

    {
        key: "experimental_method", label: "Experimental method",
        group: "Demographics", kind: "pills", any: true, first: 4,
        options: METHOD_OPTIONS.concat(ALL_BANDS.map(({ value, label }) => ({ value, label, band: true }))),
        clause: (v) => {
            if (v.length === 0) return null;
            let plain = METHOD_VALUES.filter((m) => v.includes(m));
            let either = plain.length ? [`x.method IN (${plain.map((m) => `'${m}'`).join(", ")})`] : [];
            for (const [method, bands] of Object.entries(RESOLUTION_BANDS)) {
                let asked = bands.filter((b) => v.includes(b.value) && !plain.includes(method));
                if (asked.length === 0) continue;
                let within = asked.map((b) => `(z.r >= ${b.lo} AND z.r < ${b.hi})`).join(" OR ");
                either.push(`(x.method = '${method}' AND EXISTS (SELECT 1 FROM (SELECT ${RESOLUTION_SQL} AS r) z WHERE ${within}))`);
            }
            if (either.length === 0) return "AND FALSE";
            return `AND EXISTS (SELECT 1 FROM exptl x WHERE x.entry_id = e.id AND (${either.join(" OR ")}))`;
        }
    },

    {
        key: "resolution_min", label: "Resolution (Å)", group: "Demographics", kind: "range",
        answered_by: "resolution", placeholder: "from, e.g. 2.0", pair_with: "resolution_max",
        revealed_by: { key: "experimental_method", values: RESOLUTION_METHODS },
        where: `AND ${RESOLUTION_SQL} >= ?`
    },
    {
        key: "resolution_max", label: "Resolution (Å)", group: "Demographics", kind: "range",
        answered_by: "resolution", placeholder: "to, e.g. 3.0",
        where: `AND ${RESOLUTION_SQL} <= ?`
    },

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
        // Classes are four characters; a long value would scan every step and hit the 15 s timeout.
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

    {
        key: "source_organism", label: "Source organism",
        group: "Structure Components", kind: "text", suggest: "source_organisms",
        placeholder: "e.g. mouse or Mus musculus",
        common_name_is_taxon: true,
        taxon_list: true,
        // IN, not = ANY(ARRAY(...)): 12 ms rather than 185 for Bacteria.
        where: `AND (EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                             WHERE s.entry_id = e.id
                               AND s.organism ILIKE ?)
                  OR e.id IN (SELECT s.entry_id FROM ${SOURCES_SQL} s
                                      WHERE s.taxid = ANY(?@)))`
    },

    {
        key: "taxonomy_id", label: "Taxonomy ID",
        group: "Structure Components", kind: "number", answered_by: "source_taxonomy",
        placeholder: "e.g. 4932",
        where: `AND EXISTS (SELECT 1 FROM ${SOURCES_SQL} s
                            WHERE s.entry_id = e.id AND s.taxid = ?)`
    },

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
        where: `AND (EXISTS (SELECT 1 FROM entity_src_gen g
                             WHERE g.entry_id = e.id
                               AND g.pdbx_host_org_scientific_name ILIKE ?)
                  OR e.id IN (SELECT g.entry_id FROM entity_src_gen g
                                      WHERE g.pdbx_host_org_ncbi_taxonomy_id = ANY(?@)))`
    },

    // Nucleic acid chains only: MSE is a protein label.
    {
        key: "nonstandard_residue", label: "Non-standard residue",
        group: "Structure Components", kind: "text", suggest: "nonstandard_residues",
        code_list: true,
        placeholder: "e.g. PSU or pseudouridine",
        // Not when the text is itself a code: PHA is one residue.
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND string_to_array(d.residue_codes, ', ') && ARRAY(
                                  SELECT cc.id::text FROM chem_comp cc
                                  WHERE cc.mon_nstd_flag = 'n'
                                    AND (   upper(cc.id) = upper(substr(?, 2, length(?) - 2))
                                         OR (length(?) >= 5 AND cc.name ILIKE ?
                                             AND NOT EXISTS (SELECT 1 FROM chem_comp c2
                                                             WHERE c2.mon_nstd_flag = 'n'
                                                               AND upper(c2.id) = upper(substr(?, 2, length(?) - 2)))))))`
    },

    // Not when the text is itself a code: MET is methionine.
    {
        key: "ligand", label: "Ligand", answered_by: "ligands",
        group: "Structure Components", kind: "text", suggest: "ligands",
        code_list: true,
        placeholder: "e.g. SAM or adenosyl",
        where: `AND EXISTS (SELECT 1 FROM pdbx_entity_nonpoly n
                            WHERE n.entry_id = e.id
                              AND n.comp_id = ANY (ARRAY(
                                  SELECT cc.id FROM chem_comp cc
                                  WHERE cc.id <> 'HOH'
                                    AND (   upper(cc.id) = upper(substr(?, 2, length(?) - 2))
                                         OR (length(?) >= 5 AND cc.name ILIKE ?
                                             AND NOT EXISTS (SELECT 1 FROM chem_comp c2
                                                             WHERE upper(c2.id) = upper(substr(?, 2, length(?) - 2))))))))`
    },

    {
        key: "modification", label: "Modification",
        group: "Structure Components", kind: "pills", any: true,
        options: MODIFICATIONS.map((m) => ({ value: m.value, label: m.label })),
        expand: modification_codes,
        where: `AND EXISTS (SELECT 1 FROM doc d
                            WHERE d.id = e.id
                              AND string_to_array(d.residue_codes, ', ') && ?::text[])`
    },

    {
        key: "has_ligand", label: "Ligands",
        group: "Structure Components", kind: "pills", any: false,
        options: ["With ligands", "Without ligands"].map(option),
        clause: (v) => {
            if (v.length !== 1) return null;
            let any = `EXISTS (SELECT 1 FROM pdbx_entity_nonpoly n
                               WHERE n.entry_id = e.id AND n.comp_id <> 'HOH')`;
            if (v[0] === "With ligands")    return `AND ${any}`;
            if (v[0] === "Without ligands") return `AND NOT ${any}`;
            return null;
        }
    },

    {
        key: "has_water", label: "Water",
        group: "Structure Components", kind: "pills", any: false,
        options: ["With water", "Without water"].map(option),
        clause: (v) => {
            if (v.length !== 1) return null;
            let any = `EXISTS (SELECT 1 FROM pdbx_entity_nonpoly n
                               WHERE n.entry_id = e.id AND n.comp_id = 'HOH')`;
            if (v[0] === "With water")    return `AND ${any}`;
            if (v[0] === "Without water") return `AND NOT ${any}`;
            return null;
        }
    },

    {
        key: "synthetic", label: "Chemically synthesised",
        group: "Structure Components", kind: "pills", any: false,
        options: ["Synthetic", "Not synthetic"].map(option),
        clause: (v) => {
            if (v.length !== 1) return null;
            if (v[0] === "Synthetic")     return `AND ${has_source(SOURCE_TABLES.Synthetic)}`;
            if (v[0] === "Not synthetic") return `AND NOT ${has_source(SOURCE_TABLES.Synthetic)}`;
            return null;
        }
    },

    {
        key: "polymer_type", label: "Polymer type",
        group: "Structure Components", kind: "pills", any: true,
        options: ["DNA", "RNA", "DNA/RNA",
                  "Protein/DNA", "Protein/RNA", "Protein/DNA/RNA",
                  "Protein", "Oligosaccharide", "Protein/Oligosaccharide", "Other"].map(option),
        expand: (values) => values.flatMap((v) => POLYMER_TYPE_ALIASES[v] || [v]),
        where: `AND (${POLYMER_TYPE_SQL}) = ANY(?)`,
        count_by: POLYMER_TYPE_SQL
    },

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

const of_kind = (...kinds) =>
    FILTERS.filter((f) => kinds.includes(f.kind)).map((f) => f.key);

export const TEXT_FILTERS = of_kind("text", "range", "number");
export const PILL_FILTERS = of_kind("pills");

// e.id breaks ties so a row cannot land on two pages. NULLS LAST: NMR entries have no resolution.

export const SORTS = [
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
        join: "",
        sql: `${RESOLUTION_SQL} ASC NULLS LAST`
    },
    {
        key: "resolution_desc", label: "Resolution, worst first",
        join: "",
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

    {
        key: "id_asc", label: "Entry ID, A to Z",
        join: "", sql: "e.id ASC", unique: true
    },
    {
        key: "id_desc", label: "Entry ID, Z to A",
        join: "", sql: "e.id DESC", unique: true
    }
];

export const DEFAULT_SORT = SORTS.find((s) => s.key === "best");

// Unknown keys fall back to the default, never interpolated.
export function sort_by(key) {
    return SORTS.find((s) => s.key === key) || DEFAULT_SORT;
}

export const MATCH_MODES = [
    { key: "contains", label: "Contains" },
    { key: "excludes", label: "Excludes" }
];

export const DEFAULT_MATCH = MATCH_MODES[0].key;

export function match_mode(value) {
    return MATCH_MODES.some((m) => m.key === value) ? value : DEFAULT_MATCH;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;
export const PAGE_SIZE_SUGGESTIONS = [20, 25, 50, 100];

// Always digits, so safe in LIMIT.
export function page_size_from(value) {
    let asked = Math.floor(Number(value));

    if (!Number.isFinite(asked) || asked < 1) return DEFAULT_PAGE_SIZE;

    return Math.min(asked, MAX_PAGE_SIZE);
}

export const COLUMNS = [
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

    // ::text: a JS Date shifted every deposition date back a day.
    {
        key: "deposition_date", label: "Deposition date", group: "Demographics",
        scope: "entry", select: `ds.recvd_initial_deposition_date::text`,
        show: ["page", "card"]
    },

    // Trailing digits matter: 2.00 Å and 2 Å are different claims.
    {
        key: "resolution", label: "Resolution", group: "Demographics",
        scope: "entry", select: RESOLUTION_SQL,
        decimals: 2, unit: "Å", show: ["page", "card"]
    },

    // Scalar subquery: citation_author rows can repeat, and a join would double the entry.
    {
        key: "author", label: "Author name", group: "Demographics",
        scope: "entry",
        show: [],
        select: `(SELECT ca.name FROM citation_author ca
                  WHERE ca.entry_id = e.id AND ca.citation_id = 'primary'
                  ORDER BY ca.ordinal, ca.id LIMIT 1)`
    },

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
        scope: "entry", select: ENTITY_NAME_SQL,
        show: ["card"]
    },

    // Scalar subquery: 18 entries have several source rows for entity 1.
    {
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

    {
        key: "nonstandard_residue", label: "Non-standard residues",
        group: "Structure Components", scope: "entry",
        show: ["page", "card"],
        select: `COALESCE((SELECT d.residue_codes FROM doc d WHERE d.id = e.id), '')`
    },

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

    {
        key: "assigned_ntc", label: "Assigned NtC", group: "3D Features",
        scope: "entry",
        // DISTINCT in a subquery, not inside string_agg: twice as fast.
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
        // Polymer chains only: struct_asym also lists ligands and water.
        select: `(SELECT count(*) FROM struct_asym a
                    JOIN entity en ON en.entry_id = a.entry_id AND en.id = a.entity_id
                   WHERE a.entry_id = e.id AND en.type = 'polymer')::int`
    },

    // pdbx_poly_seq_scheme counts per chain; entity_poly_seq per entity.
    {
        key: "residue_count", label: "Residues", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM (SELECT DISTINCT s.asym_id, s.seq_id
                                          FROM pdbx_poly_seq_scheme s
                                         WHERE s.entry_id = e.id) r)::int`
    },

    // report_select gives the same number: 0.4 s against 15 s for a full report.
    {
        key: "nucleotide_count", label: "Nucleotides", group: "Contents",
        scope: "detail", thousands: true,
        select: `(SELECT count(*) FROM (SELECT DISTINCT s.asym_id, s.seq_id
                                          FROM pdbx_poly_seq_scheme s
                                          JOIN entity_poly ep ON ep.entry_id = s.entry_id
                                                             AND ep.entity_id = s.entity_id
                                         WHERE s.entry_id = e.id
                                           AND ep.type ILIKE '%nucleotide%') r)::int`,
        report_select: `(SELECT COALESCE(sum(length(regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g'))
                                             * (SELECT count(*) FROM struct_asym a
                                                 WHERE a.entry_id = ep.entry_id AND a.entity_id = ep.entity_id)), 0)
                           FROM entity_poly ep
                          WHERE ep.entry_id = e.id AND ep.type ILIKE '%nucleotide%')::int`
    },

    // Model 1 only, and no water.
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

    {
        key: "ntc_classes", label: "NtC classes", group: "3D Features",
        scope: "detail",
        select: `(SELECT string_agg(c, ', ' ORDER BY c)
                  FROM (SELECT DISTINCT ss.assigned_ntc AS c
                        FROM ndb_struct_ntc_step_summary ss
                        WHERE ss.entry_id = e.id AND ss.assigned_ntc <> 'NANT') d)`
    },

    {
        key: "paper_title", label: "Paper title", group: "Citation",
        scope: "report", show: [],
        select: `(SELECT c.title FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "journal", label: "Journal", group: "Citation",
        scope: "report", show: [],
        select: `(SELECT c.journal_abbrev FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "year", label: "Year", group: "Citation",
        scope: "report", show: [],
        select: `(SELECT c.year FROM citation c
                  WHERE c.entry_id = e.id AND c.id = 'primary')`
    },

    {
        key: "r_work", label: "R-work", group: "Demographics",
        scope: "report", show: [],
        select: `(SELECT COALESCE(rfn.ls_r_factor_r_work, rfn.ls_r_factor_obs)
                  FROM refine rfn WHERE rfn.entry_id = e.id)`
    },

    {
        key: "r_free", label: "R-free", group: "Demographics",
        scope: "report", show: [],
        select: `(SELECT rfn.ls_r_factor_r_free FROM refine rfn WHERE rfn.entry_id = e.id)`
    }

];

const SAME_ENTITY = (t) => `${t}.entry_id = ep.entry_id AND ${t}.entity_id = ep.entity_id`;

export const MOLECULE_COLUMNS = [
    { key: "pdb_id", label: "Entry ID", select: `ep.entry_id` },
    { key: "molecule_id", label: "Molecule no.", select: `ep.entity_id` },

    // Author chain ids, upper case before lower, as RCSB lists them.
    { key: "chains", label: "Chains",
      select: `(SELECT string_agg(c.auth, ', ' ORDER BY length(c.auth), c.auth COLLATE "C")
                  FROM (SELECT DISTINCT (SELECT s.pdb_strand_id FROM pdbx_poly_seq_scheme s
                                          WHERE s.asym_id = a.id AND s.entry_id = a.entry_id
                                          LIMIT 1) AS auth
                          FROM struct_asym a WHERE ${SAME_ENTITY("a")}) c)` },

    { key: "copies", label: "Copies",
      select: `(SELECT count(*) FROM struct_asym a WHERE ${SAME_ENTITY("a")})::int` },

    { key: "molecule_name", label: "Name", select: `en.pdbx_description` },

    { key: "molecule_type", label: "Type",
      select: `CASE ep.type WHEN 'polyribonucleotide' THEN 'RNA'
                            WHEN 'polydeoxyribonucleotide' THEN 'DNA'
                            WHEN 'polydeoxyribonucleotide/polyribonucleotide hybrid' THEN 'DNA/RNA hybrid'
                            WHEN 'polypeptide(L)' THEN 'Protein'
                            WHEN 'polypeptide(D)' THEN 'Protein'
                            ELSE ep.type END` },

    { key: "length", label: "Length",
      select: `length(regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g'))` },

    { key: "sequence", label: "Sequence",
      select: `regexp_replace(ep.pdbx_seq_one_letter_code_can, '\\s', '', 'g')` },

    { key: "modified", label: "Modified residues", select: `mods.v` },

    { key: "organism", label: "Organism",
      select: `(SELECT string_agg(DISTINCT trim(s.organism), '; ')
                  FROM ${SOURCES_SQL} s
                 WHERE ${SAME_ENTITY("s")} AND trim(s.organism) <> '')` },

    { key: "taxonomy_id", label: "Taxonomy ID",
      select: `(SELECT string_agg(DISTINCT s.taxid::text, '; ')
                  FROM ${SOURCES_SQL} s WHERE ${SAME_ENTITY("s")})` },

    { key: "obtained", label: "Obtained",
      select: `COALESCE(
                 CASE WHEN EXISTS (SELECT 1 FROM entity_src_nat t WHERE ${SAME_ENTITY("t")}) THEN 'Natural'
                      WHEN EXISTS (SELECT 1 FROM entity_src_gen t WHERE ${SAME_ENTITY("t")}) THEN 'Expressed'
                      WHEN EXISTS (SELECT 1 FROM pdbx_entity_src_syn t WHERE ${SAME_ENTITY("t")}) THEN 'Synthetic'
                 END, 'Not recorded')` },

    { key: "expression_host", label: "Expression host",
      select: `(SELECT string_agg(DISTINCT trim(g.pdbx_host_org_scientific_name), '; ')
                  FROM entity_src_gen g
                 WHERE ${SAME_ENTITY("g")} AND trim(g.pdbx_host_org_scientific_name) <> '')` }
];

export const modified_sql = (nucleic_only) => `
    SELECT c.entry_id, c.entity_id, string_agg(c.mon_id || ' ' || c.nums, '; ' ORDER BY c.first) AS v
      FROM (SELECT p.entry_id, p.entity_id, p.mon_id, min(p.num) AS first,
                   string_agg(p.num::text, ',' ORDER BY p.num) AS nums
              FROM (SELECT DISTINCT eps.entry_id, eps.entity_id, eps.num, eps.mon_id
                      FROM entity_poly_seq eps
                     WHERE eps.entry_id = ANY($1)
                       AND eps.mon_id IN (SELECT id FROM chem_comp WHERE mon_nstd_flag = 'n')
                       ${nucleic_only ? `AND EXISTS (SELECT 1 FROM entity_poly na
                                                      WHERE na.entry_id = eps.entry_id
                                                        AND na.entity_id = eps.entity_id
                                                        AND na.type ILIKE '%nucleotide%')` : ""}) p
             GROUP BY p.entry_id, p.entity_id, p.mon_id) c
     GROUP BY c.entry_id, c.entity_id`;

export const LIGAND_COLUMNS = [
    { key: "pdb_id", label: "Entry ID", select: `n.entry_id` },
    { key: "ligand_code", label: "Code", select: `n.comp_id` },
    { key: "ligand_name", label: "Name", select: `cc.name` },
    // "Mg 2" is Mg with charge 2, as RCSB shows it.
    { key: "formula", label: "Formula", select: `regexp_replace(cc.formula, '\\s+[-+]?\\d+$', '')` },
    { key: "charge", label: "Charge",
      select: `CASE WHEN cc.formula IS NULL THEN NULL
                    ELSE COALESCE(substring(cc.formula from '\\s([-+]?\\d+)$')::int, 0) END` },
    { key: "weight", label: "Weight (Da)", select: `cc.formula_weight` },
    { key: "ligand_copies", label: "Copies", select: `en.pdbx_number_of_molecules` },
    { key: "synonyms", label: "Synonyms", select: `cc.pdbx_synonyms` }
];

export const REPORT_TABLES = [
    {
        key: "structures", name: "Structures", row: "One row per structure",
        groups: [
            { name: "Structure", keys: ["pdb_id", "title", "method", "resolution",
                                        "r_work", "r_free", "deposition_date"] },
            { name: "Paper", keys: ["author", "all_authors", "paper_title", "journal",
                                    "year", "doi", "pubmed"] },
            { name: "Contents", keys: ["polymer_type", "chain_count", "nucleotide_count",
                                       "monomer_flag"] },
            { name: "3D features", keys: ["confal_score", "confal_percentile", "ntc_classes"] }
        ],
        labels: { author: "First author", confal_score: "Confal score",
                  ntc_classes: "NtC classes", polymer_type: "Polymer types" },
        defaults: ["pdb_id", "title", "method", "resolution", "deposition_date"]
    },
    {
        key: "molecules", name: "Molecules", row: "One row per molecule in a structure",
        columns: MOLECULE_COLUMNS,
        groups: [
            { name: "Molecule", keys: ["pdb_id", "molecule_id", "chains", "copies",
                                       "molecule_name", "molecule_type", "length"] },
            { name: "Sequence", keys: ["sequence", "modified"] },
            { name: "Source", keys: ["organism", "taxonomy_id", "obtained", "expression_host"] }
        ],
        defaults: ["pdb_id", "molecule_id", "chains", "molecule_name", "molecule_type",
                   "length", "sequence"],
        option: { key: "proteins", label: "Include proteins" }
    },
    {
        key: "ligands", name: "Ligands", row: "One row per ligand in a structure",
        columns: LIGAND_COLUMNS,
        groups: [
            { name: "Ligand", keys: ["pdb_id", "ligand_code", "ligand_name", "ligand_copies"] },
            { name: "Chemistry", keys: ["formula", "charge", "weight", "synonyms"] }
        ],
        defaults: ["pdb_id", "ligand_code", "ligand_name", "formula", "ligand_copies"],
        option: { key: "water", label: "Include water" }
    }
];

export const REPORT_KEY = "pdb_id";

export function report_fields(table) {
    return table.groups.flatMap((g) => g.keys.map((key) => {
        let column = (table.columns ?? COLUMNS).find((c) => c.key === key);
        return { key, group: g.name, label: table.labels?.[key] ?? column.label };
    }));
}

export function columns_for(view, also = []) {
    return COLUMNS.filter((c) =>
        (c.show || ["page"]).includes(view) || also.includes(c.key));
}

export function columns_answering(query) {
    let keys = new Set();

    for (const filter of FILTERS) {
        if (!filter.answered_by) continue;

        let value = query[filter.key];
        if (value !== undefined && value !== "") keys.add(filter.answered_by);
    }

    return [...keys];
}

// A whitelist: a field added later stays on the server unless named here.
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

        report_tables: REPORT_TABLES.map((t) =>
            ({ key: t.key, name: t.name, row: t.row, defaults: t.defaults ?? [],
               option: t.option ?? null, fields: report_fields(t) })),
        report_key: REPORT_KEY,

        text_filters: TEXT_FILTERS,
        pill_filters: PILL_FILTERS
    };
}
