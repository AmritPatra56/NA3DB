// detail.js - turns one entry into the rows a human reads.
// Server only, and the display counterpart to search.js: filters.js holds the
// facts, search.js makes SQL from them, this makes rows. It runs here so the
// detail panel and the structure page cannot format the same field differently.

import { columns_for } from "./filters.js";
import { CANA_NAMES, NTC_CLASS_COLOURS, NTC_CLASS_NAMES, ntc_background } from "./public/cana.js";

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
// One bar of four groups (cWW A–U, cWW G–C, cWW G–U, Others), the
// Leontis–Westhof families of the Others, which chains pair with which, and
// the Others themselves. Pairs come from entry_base_pairs.

export const PAIR_LINKS_SHOWN = 5;
const PAIR_GROUPS = [["au", "cWW A–U"], ["gc", "cWW G–C"], ["gu", "cWW G–U"], ["nc", "Others"]];
// A–U for RNA, A–T for DNA, A–U/T when an entry has both kinds of pair.
const au_label = (a_with) => "cWW A–" + (a_with.has("T") ? (a_with.has("U") ? "U/T" : "T") : "U");
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

    let counts = { au: 0, gc: 0, gu: 0, nc: 0 };
    let a_with = new Set();
    let families = new Map();
    let links = new Map();
    for (const p of pairs) {
        let group = p.kind !== "wc" ? p.kind : p.bases === "CG" ? "gc" : "au";
        counts[group]++;
        if (group === "au") a_with.add(p.bases.includes("T") ? "T" : "U");
        if (p.kind === "nc") families.set(p.family, (families.get(p.family) ?? 0) + 1);
        let [a, b] = [p.chain_1, p.chain_2].sort(by_chain);
        let link = links.get(`${a} ${b}`) ?? { a, b, n: 0 };
        link.n++;
        links.set(`${a} ${b}`, link);
    }

    let link_list = [...links.values()].sort((x, y) => y.n - x.n || by_chain(x.a, y.a) || by_chain(x.b, y.b));
    return {
        total: pairs.length,
        bar: PAIR_GROUPS.map(([kind, label]) => ({ kind, n: counts[kind], percent: 100 * counts[kind] / pairs.length,
                                                   label: kind === "au" ? au_label(a_with) : label })),
        families: [...families].map(([family, n]) => ({ family, n, name: family_name(family) }))
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

// --- the arc picture ------------------------------------------------------
// The base pairs as an arc diagram, the way R-chie draws them
// (doi:10.1093/nar/gks241): each paired nucleic-acid chain is a line, 5' on
// the left, chains side by side; each pair is an arc between its two
// nucleotides, taller the further apart they are. A tRNA comes out as its
// cloverleaf seen from the side, a duplex as a rainbow.
//
// Only chains that take part in a pair are drawn, so a ribosome's 60 chains
// do not crowd the line. Each kind is a single path, so the 3,953 pairs of
// the largest entry are still three small elements. A pair listed twice
// (alternate locations) is drawn once.
//
// A crystal often holds one strand of a duplex and makes the other by
// symmetry: 1D26's A1 pairs with A8 of copy 2. That copy is drawn as its own
// strand, A′, so the duplex shows as two strands and not as a hairpin in A.
export const ARC_WIDTH = 300;
export const ARC_HEIGHT = 170;
export const ARC_HOVER_MAX = 500;   // above this, one path per kind and no hover text
const ARC_BASE = 146;    // y of the chain line; 5' and 3' sit below it
const ARC_TOP = 8;       // the widest arc peaks here
const ARC_PAD = 8;
const ARC_GAP = 16;      // between two strands, shrunk when there are many
const ARC_DOT = 2.4;
const PRIMES = ["′", "″", "‴"];
const IDENTITY = "1";    // struct_oper_id of the copy in the file
const round1 = (v) => Math.round(v * 10) / 10;
const by_copy = (a, b) => (b === IDENTITY) - (a === IDENTITY) || a.localeCompare(b, "en", { numeric: true });

// How many nucleic-acid chains a sequence map can show.
export const nucleic_chain_count = (entities) =>
    entities.filter((e) => NUCLEIC_KINDS.has(e.kind)).reduce((n, e) => n + e.chains.length, 0);

export function pair_arcs(entities, residues, pairs) {
    let chains = new Map();
    for (const e of entities) {
        if (!NUCLEIC_KINDS.has(e.kind)) continue;
        let res = residues.get(e.id) ?? [];
        let length = res.reduce((n, r) => Math.max(n, Number(r.pos)), 0) || e.length || 0;
        let modified = res.filter((r) => r.modified).map((r) => Number(r.pos));
        for (const c of e.chains) {
            chains.set(c.label, { label: c.label, name: chain_name(c), length, modified, order: chains.size,
                                  sequence: String(e.sequence ?? "").replace(/\s+/g, "") });
        }
    }

    // One end of a pair: a chain, which copy of it, and a position.
    let ends_of = (p) => [{ label: p.label_1, copy: String(p.copy_1 ?? IDENTITY), pos: p.pos_1 },
                          { label: p.label_2, copy: String(p.copy_2 ?? IDENTITY), pos: p.pos_2 }];
    let fits = ({ label, pos }) => {
        let c = chains.get(label);
        return c && Number.isInteger(pos) && pos >= 1 && pos <= c.length;
    };

    let seen = new Set();
    let drawn = [];
    let unplaced = 0;
    for (const p of pairs) {
        let ends = ends_of(p);
        let key = ends.map((e) => `${e.label} ${e.copy} ${e.pos}`).sort().join("|") + ` ${p.family}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!ends.every(fits)) { unplaced++; continue; }
        drawn.push({ ...p, ends });
    }
    if (!drawn.length) return null;

    // Strands in the page's order (nucleic acids by entity, then chain), each
    // chain's own copy before its symmetry copies.
    let strands = new Map();
    for (const e of drawn.flatMap((p) => p.ends)) {
        let key = `${e.label} ${e.copy}`;
        if (!strands.has(key)) strands.set(key, { ...chains.get(e.label), copy: e.copy });
    }
    let line = [...strands.values()].sort((x, y) => x.order - y.order || by_copy(x.copy, y.copy));
    for (const c of line) {
        let others = line.filter((s) => s.label === c.label && s.copy !== IDENTITY).map((s) => s.copy);
        let rank = others.indexOf(c.copy);
        c.symmetry = c.copy !== IDENTITY;
        c.shown = !c.symmetry ? c.name : rank < PRIMES.length ? c.name + PRIMES[rank] : `${c.name} (copy ${c.copy})`;
    }

    let total = line.reduce((n, c) => n + c.length, 0);
    let room = ARC_WIDTH - 2 * ARC_PAD;
    let gap = line.length > 1 ? Math.min(ARC_GAP, room * 0.25 / (line.length - 1)) : 0;
    let step = (room - gap * (line.length - 1)) / total;

    let start = new Map();
    let x = ARC_PAD;
    for (const c of line) {
        start.set(`${c.label} ${c.copy}`, x);
        c.x1 = round1(x);
        c.x2 = round1(x + c.length * step);
        x += c.length * step + gap;
    }
    let at = (e) => start.get(`${e.label} ${e.copy}`) + (e.pos - 0.5) * step;

    // A cubic curve peaks at 3/4 of its control height.
    let reach = ARC_BASE - ARC_TOP - 3;
    let arc = (p) => {
        let [a, b] = p.ends.map(at).sort((u, v) => u - v);
        let peak = 3 + reach * (b - a) / room;
        let y = round1(ARC_BASE - peak / 0.75);
        return `M${round1(a)} ${ARC_BASE}C${round1(a)} ${y} ${round1(b)} ${y} ${round1(b)} ${ARC_BASE}`;
    };
    // One path per kind, coloured as in the Base pairs section.
    let paths = { wc: "", gu: "", nc: "" };
    for (const p of drawn) paths[p.kind] += arc(p);

    // Few enough pairs to give each its own arc, named on hover as the Base
    // pairs table names it; a copy's end carries its prime.
    let shown = new Map(line.map((c) => [`${c.label} ${c.copy}`, c.shown]));
    let named = (e, res) => `${shown.get(`${e.label} ${e.copy}`)}:${res ?? e.pos}`;
    let label = (p) => `${named(p.ends[0], p.res_1)} – ${named(p.ends[1], p.res_2)} · ${p.family}`;
    let each = drawn.length > ARC_HOVER_MAX ? null
             : drawn.map((p) => ({ kind: p.kind, d: arc(p), label: label(p) }));

    // The same picture as numbers, for the full-screen viewer to draw at any
    // size: strands end to end, nucleotide i of the whole line at index i.
    let first = new Map();
    let n = 0;
    let on_line = line.map((c) => {
        first.set(`${c.label} ${c.copy}`, n);
        let s = { name: c.shown, symmetry: c.symmetry, start: n, length: c.length,
                  modified: c.modified.filter((pos) => pos <= c.length),
                  sequence: c.sequence.slice(0, c.length) };
        n += c.length;
        return s;
    });
    let index = (e) => first.get(`${e.label} ${e.copy}`) + e.pos;
    let layout = {
        strands: on_line,
        // [5′-most end, other end, kind, hover label, LW family, the two ends
        // named in the same order as the positions].
        pairs: drawn.map((p) => {
            let ends = [[p.ends[0], p.res_1], [p.ends[1], p.res_2]]
                .map(([e, res]) => ({ i: index(e), name: named(e, res) }))
                .sort((u, v) => u.i - v.i);
            return [ends[0].i, ends[1].i, p.kind, label(p), p.family, ends[0].name, ends[1].name];
        })
    };

    let dots = line.flatMap((c) => c.modified.filter((pos) => pos <= c.length).map((pos) => {
        let cx = round1(at({ label: c.label, copy: c.copy, pos }));
        return `M${round1(cx - ARC_DOT)} ${ARC_BASE}a${ARC_DOT} ${ARC_DOT} 0 1 0 ${2 * ARC_DOT} 0a${ARC_DOT} ${ARC_DOT} 0 1 0 ${-2 * ARC_DOT} 0`;
    }));

    return {
        width: ARC_WIDTH, height: ARC_HEIGHT, base: ARC_BASE,
        chains: line.map(({ label, copy, symmetry, shown, length, x1, x2 }) =>
            ({ label, copy, symmetry, name: shown, length, x1, x2 })),
        paths, each, layout,
        // Bold for a duplex, fine for a ribosome, so neither looks empty nor
        // turns into a blob.
        stroke: Math.round(Math.max(0.4, 1.7 * Math.min(1, Math.sqrt(40 / drawn.length))) * 100) / 100,
        dot_path: dots.join(""),
        counts: { drawn: drawn.length,
                  copies: line.filter((c) => c.symmetry).length, unplaced,
                  nucleotides: total, modified: dots.length }
    };
}

// --- the arc picture as a few numbers ------------------------------------

// What a result card says beside its picture. Null when nothing is drawn.
export function arc_summary(arcs) {
    if (!arcs) return null;
    return { strands: arcs.chains.length, nucleotides: arcs.counts.nucleotides,
             pairs: arcs.counts.drawn, modified: arcs.counts.modified,
             wc: arcs.layout.pairs.filter((p) => p[2] === "wc").length };
}

// --- the arc picture as a small image ------------------------------------

const THUMB_COLOURS = { wc: "#139068", gu: "#e0a030", nc: "#7f77dd" };
const xml = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// One entry's picture as a standalone SVG for the Arcs view: no labels, bolder
// lines, its own colours (an <img> does not see the page's stylesheet). The
// light colours are attributes; the dark ones a media query, which inside an
// <img> follows the color-scheme of the page around it, so the one cached file
// serves both themes. Same values as the tokens in style.css.
const THUMB_DARK = `<style>@media (prefers-color-scheme: dark) {`
    + `.s{stroke:#85858a}.wc{stroke:#1d9e75}.nc{stroke:#afa9ec}.m{fill:#cecbf6}.e{fill:#85858a}}</style>`;
export function arc_thumbnail(arcs, pdb_id) {
    if (!arcs) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150" role="img" aria-label="${xml(pdb_id)}: no base pairs annotated">`
             + `<text x="150" y="80" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#94a3b8" class="e">No base pairs annotated</text>${THUMB_DARK}</svg>`;
    }
    let stroke = Math.round(Math.min(2.4, arcs.stroke * 1.4) * 100) / 100;
    let lines = arcs.chains.map((c) =>
        `<line x1="${c.x1}" y1="${arcs.base}" x2="${c.x2}" y2="${arcs.base}"${c.symmetry ? ' stroke-dasharray="4 2.5"' : ""}/>`).join("");
    let paths = ["nc", "gu", "wc"].filter((k) => arcs.paths[k])
        .map((k) => `<path stroke="${THUMB_COLOURS[k]}" class="${k}" d="${arcs.paths[k]}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 ${arcs.width} ${arcs.base + 4}" role="img" aria-label="${xml(pdb_id)}: ${arcs.counts.drawn} base pairs as arcs">`
         + THUMB_DARK
         + `<g stroke="#64748b" stroke-width="2.6" stroke-linecap="round" class="s">${lines}</g>`
         + `<g fill="none" stroke-width="${stroke}">${paths}</g>`
         + (arcs.dot_path ? `<path fill="#26215c" class="m" d="${arcs.dot_path}"/>` : "")
         + `</svg>`;
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

// --- the sections of the structure page ---------------------------------
// Read in four groups, in the order a reader asks: what the entry is, what is
// in it, what shape it takes, where it came from. Each group keeps the colour
// of the filter-panel category it answers, so a search and the page it leads
// to look like one thing.
export const PAGE_GROUPS = [
    { key: "overview",    label: "Overview" },
    { key: "composition", label: "Composition" },
    { key: "structure",   label: "Structure" },
    { key: "references",  label: "References" }
];

// Rows the page shows another way: the modified nucleotide and ligand codes
// head the tables that list each one, and the NtC classes are counted in
// Conformation. Cards and exports still show them as rows.
export const SHOWN_ELSEWHERE = new Set(["nonstandard_residue", "monomer_flag", "ligands",
                                 "assigned_ntc", "ntc_classes"]);
const GROUP_SECTION = { "3D Features": "conformation" };

const sum = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);

// Every section in page order, with what it holds. A section with nothing in
// it stays listed, marked empty: "none recorded" is a fact about the entry,
// and a missing heading would read as a field we never had.
export function structure_sections({ entry, rows, molecules, base_pairs, citation, nucleic_chains = 0,
                                    same_entries = 0, ntc_classes = [] }) {
    let group_of = new Map(columns_for("page").map((c) => [c.key, c.group]));
    let rows_in = { overview: [], conformation: [] };

    for (const r of rows) {
        if (!SHOWN_ELSEWHERE.has(r.key)) rows_in[GROUP_SECTION[group_of.get(r.key)] ?? "overview"].push(r);
    }

    let polymers = molecules.groups.filter((g) => g.polymer);
    let modified = molecules.groups.filter((g) => g.modified);
    let ligands  = molecules.groups.filter((g) => !g.polymer && !g.modified);
    let steps    = entry.ntc_step_count ?? null;

    let sections = [
        { id: "overview", title: "Overview", group: "overview", rows: rows_in.overview },
        { id: "molecules", title: "Molecules", group: "composition", groups: polymers,
          count: sum(polymers) },
        { id: "sources", title: "Sources", group: "composition",
          count: molecules.sources?.rows.length ?? 0 },
        { id: "modified-nucleotides", title: "Modified nucleotides", group: "composition",
          groups: modified, count: sum(modified) },
        { id: "ligands", title: "Ligands", group: "composition", groups: ligands, count: sum(ligands) },
        { id: "base-pairs", title: "Base pairs", group: "structure",
          count: base_pairs?.total ?? 0 },
        { id: "conformation", title: "Conformation", group: "structure", rows: rows_in.conformation,
          ntc: ntc_section(ntc_classes), count: steps === null ? 0 : Number(steps) },
        { id: "sequence-map", title: "Sequence map", group: "structure", count: nucleic_chains },
        { id: "same-sequence", title: "Same sequence", group: "structure", count: same_entries },
        // The id stays "citations" so old #citations links still land here.
        { id: "citations", title: "Citation", group: "references",
          count: citation ? 1 : 0 },
        { id: "links", title: "Links and downloads", group: "references" }
    ];

    for (const s of sections) {
        s.empty = s.id === "conformation" ? !s.rows.length : s.count === 0;
    }

    return sections;
}

// The NtC classes of an entry's steps, counted and grouped by CANA class,
// so each colour sits beside its name. A-form, B-form and transitions are a
// family each; the few-member classes share "Other shapes"; steps with no
// class (NtC code NANT) come last, apart, as they are not a shape. Within a family the commonest class leads, and within
// a class the commonest NtC. Each NtC carries `background`, CSS drawing the
// same two halves as the sequence map's bar in DNATCO's colours; `key` is
// DNATCO's nine conformer classes, for the colour fold-out.
const NTC_FAMILIES = [
    ["A-form family", ["AAA", "AAw", "AAu"]],
    ["B-form family", ["BBB", "BBw", "miB", "BB2"]],
    ["Transitions", ["A-B", "B-A", "B12"]],
    ["Other shapes", ["ZZZ", "ICL", "OPN", "SYN"]],
    ["No NtC class", ["NAN"]]
];

export function ntc_section(classes) {
    let by_cana = new Map();
    for (const c of classes) {
        let cana = c.ntc === "NANT" || !CANA_NAMES[c.cana] ? "NAN" : c.cana;
        if (!by_cana.has(cana)) by_cana.set(cana, []);
        by_cana.get(cana).push({ ntc: c.ntc, n: Number(c.n), background: ntc_background(c.ntc) });
    }
    let by_count = (x, y) => y.n - x.n || x.ntc.localeCompare(y.ntc);
    let families = [];
    for (const [name, codes] of NTC_FAMILIES) {
        let list = codes.filter((code) => by_cana.has(code)).map((code) => {
            let ntcs = by_cana.get(code).sort(by_count);
            return { cana: code, name: CANA_NAMES[code], n: ntcs.reduce((t, c) => t + c.n, 0), ntcs };
        });
        list.sort((x, y) => y.n - x.n);
        if (list.length) families.push({ name, n: list.reduce((t, c) => t + c.n, 0), classes: list });
    }
    let unassigned = by_cana.get("NAN")?.reduce((t, c) => t + c.n, 0) ?? 0;
    let assigned = families.reduce((t, f) => t + f.n, 0) - unassigned;
    let key = Object.entries(NTC_CLASS_COLOURS).map(([code, colour]) => ({ code, name: NTC_CLASS_NAMES[code], background: colour }));
    return { families, assigned, unassigned, key };
}

// ---- Sequence map ----------------------------------------------------------
// One ruler per set of strands: the sequence, the NtC step between each two
// nucleotides, and every base pair in layered dot-bracket rows (one row per
// Leontis–Westhof family, a base that pairs twice in one family spilling to
// another row). The notation is the one from the NA hackathon 2026
// (ws2 layered-bp-notation); its text round-trips back to the pairs.
const LBN_BRACKETS = ["()", "[]", "{}", "<>", "Aa", "Bb", "Cc", "Dd"];
const LBN_FAMILIES = ["cWH", "cWS", "cHW", "cHH", "cHS", "cSW", "cSH", "cSS",
                      "tWW", "tWH", "tWS", "tHW", "tHH", "tHS", "tSW", "tSH", "tSS"];
const LBN_SEP = "&";
export const flip_lw = (f) => f[0] + f[2] + f[1];
const crosses = ([i, j], [k, l]) => (i < k && k < j && j < l) || (k < i && i < l && l < j);
const strand_token = (label, copy) => (copy === IDENTITY ? label : `${label}:${copy}`);

// A, C, G, U or T; a modified nucleotide is its parent in lower case, and
// one with no known parent is n.
export function nucleotide_letter(r) {
    let base = String(r.parent ?? r.code ?? "").replace(/^D(?=[ACGTU]$)/, "");
    let letter = /^[ACGTUI]$/.test(base) ? base : "N";
    return r.modified ? letter.toLowerCase() : letter;
}

// One dot-bracket line: brackets of a deeper kind for a pair that crosses one
// already drawn in the same row. Pairs come in by their first base, and the
// pairs of one level never cross, so the ones still open there are nested:
// p crosses one of them exactly when the innermost closes before p does.
// One stack of open pairs per level keeps this linear, not quadratic.
export function bracket_line(width, seps, pairs) {
    let chars = Array.from({ length: width }, (_, i) => (seps.has(i) ? LBN_SEP : "."));
    let open = [];
    for (const p of [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        let level = 0;
        for (;; level++) {
            let stack = open[level] ??= [];
            while (stack.length && stack.at(-1)[1] <= p[0]) stack.pop();
            if (!stack.length || !crosses(p, stack.at(-1))) { stack.push(p); break; }
        }
        let kind = LBN_BRACKETS[Math.min(level, LBN_BRACKETS.length - 1)];
        chars[p[0]] = kind[0];
        chars[p[1]] = kind[1];
    }
    return chars.join("");
}

// One row per family in a fixed order; a base already used in its row goes
// to an overflow row of the same family, packed as tightly as fits. Each
// placed pair is { i, j, family, row } with i < j; any other field it has
// stays on it, so a caller can mark pairs and still read the mark back.
export function layer_rows(placed, width, seps = new Set()) {
    let rows = [];
    let overflow = [];
    for (const name of ["WC", "cWW", ...LBN_FAMILIES]) {
        let group = placed.filter((p) => p.row === name).sort((a, b) => a.i - b.i || a.j - b.j);
        if (!group.length) continue;
        let used = new Set();
        let row = [];
        let extra = [];
        for (const p of group) {
            if (used.has(p.i) || used.has(p.j)) { extra.push(p); continue; }
            row.push(p);
            used.add(p.i).add(p.j);
        }
        rows.push({ name, family: name === "WC" ? "cWW" : name, pairs: row });
        let buckets = [];
        for (const p of extra) {
            let b = buckets.find((b) => !b.some((q) => [q.i, q.j].includes(p.i) || [q.i, q.j].includes(p.j)));
            b ? b.push(p) : buckets.push([p]);
        }
        overflow.push(...buckets.map((b) => ({ name: name === "WC" ? "cWW" : name, family: name === "WC" ? "cWW" : name,
                                               pairs: b, overflow: true })));
    }
    rows.push(...overflow);
    for (const r of rows) r.text = bracket_line(width, seps, r.pairs.map((p) => [p.i, p.j]));
    return rows;
}

// The strands a map can show: every nucleic-acid chain as it is in the file,
// and every symmetry copy that pairs with one. Each knows whom it pairs with.
function map_strands(entities, by_chain, pairs) {
    let strands = new Map();
    let order = 0;
    for (const e of entities) {
        if (!NUCLEIC_KINDS.has(e.kind)) continue;
        for (const c of e.chains) {
            if (!by_chain.has(c.label)) continue;
            strands.set(strand_token(c.label, IDENTITY),
                        { label: c.label, copy: IDENTITY, base: chain_name(c), order: order++, partners: new Set() });
        }
    }
    let ends = (p) => [strand_token(p.label_1, String(p.copy_1 ?? IDENTITY)),
                       strand_token(p.label_2, String(p.copy_2 ?? IDENTITY))];
    for (const p of pairs) {
        let [a, b] = ends(p);
        for (const [key, label, copy] of [[a, p.label_1, String(p.copy_1 ?? IDENTITY)],
                                          [b, p.label_2, String(p.copy_2 ?? IDENTITY)]]) {
            let own = strands.get(strand_token(label, IDENTITY));
            if (own && !strands.has(key)) strands.set(key, { ...own, copy, partners: new Set() });
        }
        if (strands.has(a) && strands.has(b)) {
            strands.get(a).partners.add(b);
            strands.get(b).partners.add(a);
        }
    }
    let list = [...strands.entries()].map(([key, s]) => ({ key, ...s }))
        .sort((x, y) => x.order - y.order || by_copy(x.copy, y.copy));
    for (const s of list) {
        let rank = list.filter((t) => t.label === s.label && t.copy !== IDENTITY).findIndex((t) => t.copy === s.copy);
        s.symmetry = s.copy !== IDENTITY;
        s.name = !s.symmetry ? s.base : rank < PRIMES.length ? s.base + PRIMES[rank] : `${s.base} (copy ${s.copy})`;
    }
    return list;
}

// The map for the strands asked for (tokens such as A or A:2_755), or, when
// none are, the first chain with pairs and the strands it pairs with.
export function sequence_map(entities, tracks, pairs, wanted = []) {
    let by_chain = new Map();
    for (const r of tracks.residues) {
        if (!by_chain.has(r.label)) by_chain.set(r.label, []);
        by_chain.get(r.label).push(r);
    }
    let strands = map_strands(entities, by_chain, pairs);
    if (!strands.length) return null;

    let known = new Set(strands.map((s) => s.key));
    let chosen = wanted.filter((k) => known.has(k));
    if (!chosen.length) {
        let first = strands.find((s) => s.partners.size) ?? strands[0];
        chosen = [first.key, ...[...first.partners].filter((k) => k !== first.key)];
    }
    let shown = strands.filter((s) => chosen.includes(s.key));

    // The ruler: strands end to end, a separator column between two.
    let cols = [];
    let at = new Map();
    let seps = new Set();
    shown.forEach((s, n) => {
        if (n) { seps.add(cols.length); cols.push(null); }
        for (const r of by_chain.get(s.label)) {
            at.set(`${s.key} ${r.pos}`, cols.length);
            cols.push({ strand: n, pos: r.pos, num: r.num, code: r.code, letter: nucleotide_letter(r),
                        seen: r.seen !== false });
        }
    });

    // Each pair once, lower column first, its family read from that side.
    let seen = new Set();
    let placed = [];
    for (const p of pairs) {
        let i = at.get(`${strand_token(p.label_1, String(p.copy_1 ?? IDENTITY))} ${p.pos_1}`);
        let j = at.get(`${strand_token(p.label_2, String(p.copy_2 ?? IDENTITY))} ${p.pos_2}`);
        if (i === undefined || j === undefined || i === j) continue;
        let family = p.family;
        if (i > j) [i, j, family] = [j, i, flip_lw(family)];
        let key = `${i} ${j} ${family}`;
        if (seen.has(key)) continue;
        seen.add(key);
        placed.push({ i, j, family, row: family === "cWW" ? (p.kind === "wc" ? "WC" : "cWW") : family });
    }

    let rows = layer_rows(placed, cols.length, seps);
    for (const r of rows) r.pairs = r.pairs.map((p) => [p.i, p.j]);

    // The step from each nucleotide to the next one on the ruler; symmetry
    // copies share their chain's steps.
    let steps = [];
    for (const t of tracks.steps) {
        for (const [n, s] of shown.entries()) {
            if (t.label_1 !== s.label || t.label_2 !== s.label) continue;
            let i = at.get(`${s.key} ${t.pos_1}`);
            if (i === undefined || at.get(`${s.key} ${t.pos_2}`) !== i + 1) continue;
            let assigned = t.ntc && t.ntc !== "NANT";
            steps.push({ i, ntc: assigned ? t.ntc : null, cana: assigned ? t.cana : "NAN",
                         confal: t.confal === null ? null : Number(t.confal), closest: t.closest ?? null, strand: n });
        }
    }
    steps.sort((a, b) => a.i - b.i);

    let seq = cols.map((c) => (c ? c.letter : LBN_SEP)).join("");
    return {
        strands: strands.map(({ key, name, symmetry, label, partners }) =>
            ({ key, name, symmetry, label, length: by_chain.get(label).length, partners: [...partners] })),
        shown: shown.map((s) => s.key),
        names: shown.map((s) => s.name),
        cols: cols.map((c) => c && [c.letter, c.num, c.seen ? 1 : 0, c.code]),
        rows: rows.map(({ name, family, text, pairs, overflow }) => ({ name, family, text, pairs, overflow: !!overflow })),
        steps,
        seq
    };
}

// The map as the notation's text file: a header naming the strands, the rows
// under one ruler, and the NtC steps as # comments, which readers skip.
export function sequence_map_text(pdb_id, map) {
    let lines = [`>${[pdb_id, ...map.shown].join("|")}`,
                 `# strands: ${map.names.join(", ")}; '${LBN_SEP}' separates strands`];
    let by_i = new Map(map.steps.map((s) => [s.i, s]));
    lines.push(`# ntc: ${map.steps.map((s) => `${s.i + 1}:${s.ntc ?? "NANT"}`).join(" ")}`);
    lines.push(`# cana (step after each column): ${map.cols.map((c, i) => (c ? by_i.get(i)?.cana ?? "-" : LBN_SEP)).join(" ")}`);
    lines.push(`${"seq".padEnd(12)}: ${map.seq}`);
    for (const r of map.rows) lines.push(`${r.name.padEnd(12)}: ${r.text}`);
    return lines.join("\n") + "\n";
}
