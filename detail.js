// detail.js - turns one entry into the rows a human reads.
// Server only, and the display counterpart to search.js: filters.js holds the
// facts, search.js makes SQL from them, this makes rows. It runs here so the
// detail panel and the structure page cannot format the same field differently.

import { columns_for } from "./filters.js";

// One value as display text, or null when there is nothing to show.
// The locale is pinned: toLocaleString() with none uses the viewer's machine,
// so 10,000 would read 10.000 in Germany.
function display(value, column) {
    if (value === null || value === undefined || value === "") return null;

    let text;

    if (column.decimals !== undefined) text = Number(value).toFixed(column.decimals);
    else if (column.thousands)         text = Number(value).toLocaleString("en-GB");
    else                               text = String(value);

    return column.unit ? `${text} ${column.unit}` : text;
}

// The rows a view shows, in registry order. An empty value is dropped rather
// than drawn blank, unless the column names what to say instead. The view names come from each column's `show` list, so
// adding a place to display columns in means naming it there, not here.
//
// `also` names extra column keys for this one render: a card shows the field
// that was searched on even when it is not normally on the card.
export function detail_rows(entry, view = "page", also = []) {
    let rows = [];

    for (const column of columns_for(view, also)) {

        let raw = entry[column.key];
        if ((raw === null || raw === undefined || raw === "") && column.fallback) {
            raw = entry[column.fallback];
        }

        // `empty` says a blank is a fact about the entry, not a gap in ours.
        let value = display(raw, column) ?? column.empty ?? null;
        if (value !== null) rows.push({ label: column.label, value });
    }

    return rows;
}

// --- the Molecules section of the structure page ------------------------
// Groups in the order entry_contents sorts them, nucleic acids first. Water
// is left out: it is solvent, not part of the molecule. A protein group past
// FOLD_PROTEINS starts closed, so a ribosome's RNA is not buried under it.

export const FOLD_PROTEINS = 10;
// 8G61 has 224 modified positions; a row shows this many, the rest on a click.
export const POSITIONS_SHOWN = 5;
const MISSING_RUNS_SHOWN = 4;
const UNIT = { "RNA": "nt", "DNA": "nt", "DNA/RNA hybrid": "nt", "Protein": "aa" };

function residue(mon, num) {
    return num === null || num === undefined ? mon : `${mon}${num}`;
}

// 1L9A: "A173, G174". A long gap is a range with its size instead.
function run_text(run) {
    if (run.count === 1) return residue(run.from_mon, run.from);
    if (run.count === 2) return `${residue(run.from_mon, run.from)}, ${residue(run.to_mon, run.to)}`;
    return `${run.from}–${run.to} (${run.count})`;
}

function missing_text(runs) {
    let shown = runs.slice(0, MISSING_RUNS_SHOWN).map(run_text);
    let rest = runs.length - shown.length;
    return shown.join(", ") + (rest > 0 ? `, + ${rest} more gaps` : "");
}

function chain_name(chain) {
    return chain.auth || chain.label;
}

// One polymer as a table row. Copies of one entity usually share their
// numbering; when they do not, each chain says its own.
function polymer_row(entity) {
    let unit = UNIT[entity.kind] || "";
    let chains = entity.chains;
    let modelled = (c) => `${c.modelled} / ${c.total}`;
    let numbering = (c) => (c.first === c.last ? `${c.first ?? ""}` : `${c.first}–${c.last}`);
    let same = (f) => chains.every((c) => f(c) === f(chains[0]));
    let per_chain = (f) => same(f) ? f(chains[0])
                                   : chains.map((c) => `${chain_name(c)}: ${f(c)}`).join("; ");
    let gaps = chains.filter((c) => c.missing && c.missing.length);

    return {
        name:      entity.description,
        links:     (entity.references || []).map(({ label, code, url }) => ({ text: `${label} ${code}`, url })),
        length:    entity.length ? `${entity.length} ${unit}`.trim() : null,
        chains:    chains.map((c) => ({ name: chain_name(c),
                                        title: c.auth && c.auth !== c.label ? `label id ${c.label}` : null })),
        modelled:  chains.length && chains[0].total !== undefined ? per_chain(modelled) : null,
        missing:   gaps.length === 0 ? null
                 : gaps.length === chains.length && same((c) => missing_text(c.missing))
                 ? missing_text(gaps[0].missing)
                 : gaps.map((c) => `${chain_name(c)}: ${missing_text(c.missing)}`).join("; "),
        numbering: chains.length && chains[0].first ? per_chain(numbering) : null
    };
}

// --- the Source section of the structure page --------------------------
// Where each polymer came from, in its own table so that how it was obtained,
// the organism and the expression host are three columns and not one line to
// untangle. Polymers with the same source share a row: 6SGB has 103 molecules
// purified from one organism.

const SYNTHETIC_CONSTRUCT = 32630;
// Up to this many molecules are named in their row; more fold behind a count.
export const SOURCE_LISTED = 3;
const taxon_url = (id) => `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${id}`;

export const SOURCE_LEGEND = [
    { kind: "Natural",   text: "purified from the organism" },
    { kind: "Expressed", text: "gene cloned and produced in a host" },
    { kind: "Synthetic", text: "made chemically; the organism is where the sequence comes from" }
];

// 408 natural rows are in capitals; "SACCHAROMYCES CEREVISIAE (STRAIN S288C)"
// reads "Saccharomyces cerevisiae (STRAIN S288C)": a strain's capitals may be
// its own, so only the first two words are recased.
export function species_case(name) {
    if (!name || name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
    let words = name.split(" ");
    // Genus and species, then nothing or a strain. Anything else is left in
    // capitals: "HEPATITIS C VIRUS" cannot be recased without knowing virology.
    let plain = (w) => /^[A-Z]{2,}$/.test(w ?? "");
    if (!plain(words[0]) || !plain(words[1]) || plain(words[2])) return name;
    words[0] = words[0][0] + words[0].slice(1).toLowerCase();
    words[1] = words[1].toLowerCase();
    return words.join(" ");
}

function is_construct(seg) {
    return seg.taxid === SYNTHETIC_CONSTRUCT || /^synthetic construct$/i.test(seg.organism ?? "");
}

function organism_cell(o) {
    if (!o.organism) return null;
    if (is_construct(o)) return { name: "synthetic construct", italic: false, common: null };
    return { name: species_case(o.organism), italic: true,
             common: o.common_name ? o.common_name.toLowerCase() : null };
}

const taxon = (id) => (id ? { id, url: taxon_url(id) } : null);

// 3WFR files the gene and strain of its Aquifex segment on the synthetic
// linkers too, and names the strain inside the organism; neither is repeated.
function notes_of(seg) {
    let construct = is_construct(seg);
    let strain = !construct && seg.strain
              && !(seg.organism ?? "").toLowerCase().includes(seg.strain.toLowerCase())
               ? (/strain/i.test(seg.strain) ? seg.strain : `strain ${seg.strain}`) : null;
    let notes = [strain, !construct && seg.gene && `gene ${seg.gene}`,
                 seg.cell_line && `cell line ${seg.cell_line}`, seg.details].filter(Boolean);
    return notes.length ? notes.join("; ") : null;
}

function source_row(source, molecules) {
    let segments = (source?.segments ?? [{}]).map((seg) => ({
        range: seg.from != null && seg.to != null ? `${seg.from}–${seg.to}` : null,
        organism: organism_cell(seg), taxon: taxon(seg.taxid), notes: notes_of(seg)
    }));
    let host = source?.host;
    return {
        kind: source?.kind ?? "Not recorded",
        molecules,
        listed: molecules.length <= SOURCE_LISTED,
        chain_count: molecules.reduce((n, m) => n + m.chains.length, 0),
        segments,
        host: host ? { organism: organism_cell(host), taxon: taxon(host.taxid) } : null
    };
}

export function source_section(entities) {
    let groups = new Map();
    for (const e of entities.filter((e) => e.type === "polymer")) {
        let key = JSON.stringify(e.source ?? null);
        if (!groups.has(key)) groups.set(key, { source: e.source ?? null, molecules: [] });
        groups.get(key).molecules.push({ name: e.description, chains: e.chains.map(chain_name) });
    }
    if (!groups.size) return null;

    let rows = [...groups.values()].map((g) => source_row(g.source, g.molecules));
    return { legend: SOURCE_LEGEND, rows,
             notes: rows.some((r) => r.segments.some((s) => s.notes)) };
}

export function molecule_groups(contents) {
    let groups = [];

    for (const entity of contents.entities) {
        if (entity.kind === "Water") continue;

        let group = groups.at(-1);
        if (!group || group.kind !== entity.kind) {
            group = { kind: entity.kind, rows: [] };
            groups.push(group);
        }

        group.rows.push(entity.type === "polymer"
            ? polymer_row(entity)
            : { code: entity.comp_id, name: entity.description, count: entity.chains.length,
                url: entity.comp_id ? `https://www.rcsb.org/ligand/${entity.comp_id}` : null });
    }

    for (const g of groups) {
        g.polymer = g.rows[0].code === undefined;
        g.modified = false;
        g.folded = g.kind === "Protein" && g.rows.length > FOLD_PROTEINS;
        g.title = g.kind === "Ligand" ? "Ligands" : g.kind;
    }

    let summary = groups.map((g) =>
        `${g.rows.length} ${g.kind === "Ligand" ? (g.rows.length === 1 ? "ligand" : "ligands")
                                                : g.kind.toLowerCase().replace("dna", "DNA").replace("rna", "RNA")}`);

    if (contents.modified?.length) {
        let after = groups.findLastIndex((g) => NUCLEIC_KINDS.has(g.kind)) + 1;
        groups.splice(after, 0, { kind: "Modified", title: "Modified nucleotides",
                                  polymer: false, modified: true, folded: false,
                                  rows: contents.modified.map(modified_row) });
    }

    return { groups, summary: summary.join(" · "), sources: source_section(contents.entities) };
}

const NUCLEIC_KINDS = new Set(["RNA", "DNA", "DNA/RNA hybrid"]);

function modified_row(m) {
    let positions = m.positions.map((p) => ({ num: p.num, seen: p.seen }));
    return {
        code: m.code, name: m.name,
        url: `https://www.rcsb.org/ligand/${m.code}`,
        chain: { name: m.auth ?? m.label, title: m.auth && m.auth !== m.label ? `label id ${m.label}` : null },
        shown: positions.slice(0, POSITIONS_SHOWN),
        rest: positions.slice(POSITIONS_SHOWN)
    };
}
