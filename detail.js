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
    else if (column.species)           text = String(value).split("; ").map(species_case).join("; ");
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
        // key lets a card pick its rows by name; searched marks the rows that
        // answer the search, which a phone card keeps when it drops the rest.
        if (value !== null) rows.push({ key: column.key, label: column.label, value,
                                        searched: also.includes(column.key) });
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
// 1OB5 lists 36 modified rows (12 codes in 3 tRNA copies); the first few show,
// the rest wait behind a button.
export const MODIFIED_ROWS_SHOWN = 6;
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
function polymer_row(entity, residues) {
    let unit = UNIT[entity.kind] || "";
    let chains = entity.chains;
    let modelled = (c) => `${c.modelled} / ${c.total}`;
    let numbering = (c) => (c.first === c.last ? `${c.first ?? ""}` : `${c.first}–${c.last}`);
    let same = (f) => chains.every((c) => f(c) === f(chains[0]));
    let per_chain = (f) => same(f) ? f(chains[0])
                                   : chains.map((c) => `${chain_name(c)}: ${f(c)}`).join("; ");
    let gaps = chains.filter((c) => c.missing && c.missing.length);

    return {
        entity_id: entity.id,
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
        numbering: chains.length && chains[0].first ? per_chain(numbering) : null,
        sequence:  sequence_lines(entity.sequence, residues)
    };
}

// The sequence in lines of SEQUENCE_LINE letters, blocks of 10, as runs of
// plain letters and marked ones: a modified nucleotide (shown as its parent's
// letter, the code on hover) or a position no chain has in the model.
// residues come from entry_residues, in the same order as the letters.
export const SEQUENCE_LINE = 60;

export function sequence_lines(sequence, residues = []) {
    if (!sequence) return null;
    let at = (r) => r?.auth ? `${r.code}${r.auth}` : r?.code;
    let lines = [];
    for (let start = 0; start < sequence.length; start += SEQUENCE_LINE) {
        // A stretch of unmodelled positions is one span, block spaces and
        // all: 9MU2 has 88,856 of them. A modified residue is one span each.
        let runs = [];
        let open = null;          // the unmodelled run being extended, with its first residue
        for (let i = start; i < Math.min(start + SEQUENCE_LINE, sequence.length); i++) {
            let r = residues[i];
            let mark = r?.modified ? "modified" : r && !r.seen ? "unmodelled" : null;
            let space = i > start && i % 10 === 0 ? " " : "";
            if (mark === "unmodelled" && open) {
                open.run.text += space + sequence[i];
                open.last = r;
                continue;
            }
            if (open) { close_run(open); open = null; }
            let last = runs.at(-1);
            if (space) {
                if (last && !last.mark) last.text += space;
                else runs.push(last = { text: space, mark: null, title: null });
            }
            if (mark === "modified") {
                runs.push({ text: sequence[i], mark, title: `${at(r)}: ${r.name ?? r.code}${r.seen ? "" : ", not modelled"}` });
            } else if (mark === "unmodelled") {
                open = { run: { text: sequence[i], mark, title: null }, first: r, last: r };
                runs.push(open.run);
            } else if (last && !last.mark) {
                last.text += sequence[i];
            } else {
                runs.push({ text: sequence[i], mark: null, title: null });
            }
        }
        if (open) close_run(open);
        lines.push({ start: start + 1, runs });
    }

    function close_run({ run, first, last }) {
        run.title = `${first === last ? at(first) : `${at(first)}–${at(last)}`}: not modelled`;
    }

    let marks = new Set(lines.flatMap((l) => l.runs.map((r) => r.mark)));
    return { lines, length: sequence.length, modified: marks.has("modified"), unmodelled: marks.has("unmodelled") };
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

export function molecule_groups(contents, residues = new Map()) {
    let groups = [];

    for (const entity of contents.entities) {
        if (entity.kind === "Water") continue;

        let group = groups.at(-1);
        if (!group || group.kind !== entity.kind) {
            group = { kind: entity.kind, rows: [] };
            groups.push(group);
        }

        group.rows.push(entity.type === "polymer"
            ? polymer_row(entity, residues.get(entity.id))
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
                                  shown: MODIFIED_ROWS_SHOWN,
                                  rows: contents.modified.map(modified_row) });
    }

    return { groups, summary: summary.join(" · "), sources: source_section(contents.entities),
             fasta: fasta_choices(contents.entities) };
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

// --- the Base pairs section of the structure page ----------------------
// One bar (Watson–Crick / G·U wobble / non-canonical), the Leontis–Westhof
// families of the non-canonical pairs, which chains pair with which, and the
// non-canonical pairs themselves. Pairs come from entry_base_pairs.

export const PAIR_LINKS_SHOWN = 5;
const PAIR_KINDS = [["wc", "Watson–Crick"], ["gu", "G·U wobble"], ["nc", "non-canonical"]];
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };

const by_chain = (a, b) => a.length - b.length || a.localeCompare(b);
const and_list = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

// "tWH" → "trans Watson–Crick / Hoogsteen", for a tooltip.
export function family_name(family) {
    let [ct, e1, e2] = family;
    return `${ct === "c" ? "cis" : "trans"} ${EDGE[e1]} / ${EDGE[e2]}`;
}

// A sentence when every chain pairs only with itself, which is the common
// case (a folded RNA, or copies of one); otherwise null and the links are listed.
function self_paired(links) {
    if (!links.every((l) => l.a === l.b)) return null;
    let chains = links.map((l) => l.a).sort(by_chain);
    if (chains.length === 1) return `Chain ${chains[0]} pairs only with itself.`;
    let named = chains.length > PAIR_LINKS_SHOWN ? `${chains.length} chains` : `Chains ${and_list(chains)}`;
    let same = links.every((l) => l.n === links[0].n);
    let each = same ? `, ${links[0].n} ${links[0].n === 1 ? "pair" : "pairs"} each`
             : chains.length > PAIR_LINKS_SHOWN ? "" : ` (${links.slice().sort((x, y) => by_chain(x.a, y.a)).map((l) => `${l.a} ${l.n}`).join(", ")})`;
    return `${named} each pair only with themselves${each}.`;
}

export function base_pair_section(pairs) {
    if (!pairs.length) return null;

    let counts = { wc: 0, gu: 0, nc: 0 };
    let families = new Map();
    let links = new Map();
    for (const p of pairs) {
        counts[p.kind]++;
        if (p.kind === "nc") families.set(p.family, (families.get(p.family) ?? 0) + 1);
        let [a, b] = [p.chain_1, p.chain_2].sort(by_chain);
        let link = links.get(`${a} ${b}`) ?? { a, b, n: 0 };
        link.n++;
        links.set(`${a} ${b}`, link);
    }

    let link_list = [...links.values()].sort((x, y) => y.n - x.n || by_chain(x.a, y.a) || by_chain(x.b, y.b));
    return {
        total: pairs.length,
        bar: PAIR_KINDS.map(([kind, label]) => ({ kind, label, n: counts[kind],
                                                  percent: 100 * counts[kind] / pairs.length })),
        families: [...families].map(([family, n]) => ({ family, n, name: family_name(family),
                                                        mismatch: family === "cWW" }))
                               .sort((x, y) => y.n - x.n || x.family.localeCompare(y.family)),
        sentence: self_paired(link_list),
        links: link_list.map((l) => ({ ...l, text: `${l.a === l.b ? `${l.a} with itself` : `${l.a} with ${l.b}`}: `
                                          + `${l.n.toLocaleString("en-GB")} ${l.n === 1 ? "pair" : "pairs"}` })),
        links_shown: PAIR_LINKS_SHOWN,
        noncanonical: pairs.filter((p) => p.kind === "nc").map((p) => ({
            chain: p.chain_1 === p.chain_2 ? p.chain_1 : `${p.chain_1} / ${p.chain_2}`,
            pair: `${p.res_1} – ${p.res_2}`, family: p.family, name: family_name(p.family)
        }))
    };
}

// --- FASTA ---------------------------------------------------------------
// One polymer in the header layout RCSB uses, so files from both sites look
// alike: >1OB5_2|Chains B, D, F|TRANSFER-RNA, PHE|Saccharomyces cerevisiae (4932).
// Lines of 80. A chimera's organisms are joined; none is left out.
export const FASTA_LINE = 80;

export function fasta_of(entry_id, entity) {
    if (!entity?.sequence) return null;
    let chains = entity.chains.map(chain_name);
    let organisms = (entity.source?.segments ?? [])
        .filter((s) => s.organism)
        .map((s) => `${species_case(s.organism)}${s.taxid ? ` (${s.taxid})` : ""}`);
    let header = [`${entry_id.toUpperCase()}_${entity.id}`,
                  `${chains.length === 1 ? "Chain" : "Chains"} ${chains.join(", ")}`,
                  entity.description ?? "",
                  [...new Set(organisms)].join(", ")].filter(Boolean).join("|");
    let lines = entity.sequence.match(new RegExp(`.{1,${FASTA_LINE}}`, "g"));
    return `>${header}\n${lines.join("\n")}\n`;
}

// Every molecule with a sequence in one file, in the page's order (nucleic
// acids first). Ligands and water have no sequence, so they drop out.
// Sequences are PDB's own: 1OB5's charged tRNA ends in F, as at RCSB.
export function entry_fasta(entry_id, entities, { na_only = false } = {}) {
    let records = entities
        .filter((e) => !na_only || NUCLEIC_KINDS.has(e.kind))
        .map((e) => fasta_of(entry_id, e))
        .filter(Boolean);
    return records.length ? records.join("") : null;
}

// How many records each download would hold, so the page offers a choice
// only when the two differ.
export function fasta_choices(entities) {
    let sequenced = entities.filter((e) => e.sequence);
    return { all: sequenced.length,
             na: sequenced.filter((e) => NUCLEIC_KINDS.has(e.kind)).length };
}

// --- base pairs for scripts ---------------------------------------------
// The same rows the page draws, so the API and the page cannot disagree.
// The model sits once at the top: every pair comes from the same one.
const PAIR_FIELDS = ["chain_1", "res_1", "chain_2", "res_2", "family", "kind"];

export function base_pair_export(entry_id, pairs) {
    let counts = { wc: 0, gu: 0, nc: 0 };
    for (const p of pairs) counts[p.kind]++;
    return {
        entry: entry_id.toUpperCase(),
        model: pairs[0]?.model ?? null,
        total: pairs.length,
        counts,
        pairs: pairs.map((p) => Object.fromEntries(PAIR_FIELDS.map((k) => [k, p[k]])))
    };
}

// A comma, quote or line break means the whole cell is quoted, quotes doubled.
const csv_cell = (v) => (/[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replaceAll('"', '""')}"` : String(v ?? ""));

export function base_pairs_csv(pairs) {
    return [PAIR_FIELDS, ...pairs.map((p) => PAIR_FIELDS.map((k) => p[k]))]
        .map((row) => row.map(csv_cell).join(",")).join("\n") + "\n";
}
