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
            : { code: entity.comp_id, name: entity.description, count: entity.chains.length });
    }

    for (const g of groups) {
        g.polymer = g.rows[0].code === undefined;
        g.folded = g.kind === "Protein" && g.rows.length > FOLD_PROTEINS;
        g.title = g.kind === "Ligand" ? "Ligands" : g.kind;
    }

    let summary = groups.map((g) =>
        `${g.rows.length} ${g.kind === "Ligand" ? (g.rows.length === 1 ? "ligand" : "ligands")
                                                : g.kind.toLowerCase().replace("dna", "DNA").replace("rna", "RNA")}`);

    return { groups, summary: summary.join(" · ") };
}
