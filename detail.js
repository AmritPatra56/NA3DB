import { columns_for } from "./filters.js";
import { CANA_NAMES, NTC_CLASS_COLOURS, NTC_CLASS_NAMES, ntc_background } from "./public/cana.js";

// Pinned locale, or 10,000 reads 10.000 on a German machine.
function display(value, column) {
    if (value === null || value === undefined || value === "") return null;

    let text;

    if (column.decimals !== undefined) text = Number(value).toFixed(column.decimals);
    else if (column.thousands)         text = Number(value).toLocaleString("en-GB");
    else if (column.species)           text = String(value).split("; ").map(species_case).join("; ");
    else                               text = String(value);

    return column.unit ? `${text} ${column.unit}` : text;
}

export function detail_rows(entry, view = "page", also = []) {
    let rows = [];

    for (const column of columns_for(view, also)) {

        let raw = entry[column.key];
        if ((raw === null || raw === undefined || raw === "") && column.fallback) {
            raw = entry[column.fallback];
        }

        let value = display(raw, column) ?? column.empty ?? null;
        if (value !== null) rows.push({ key: column.key, label: column.label, value,
                                        searched: also.includes(column.key) });
    }

    return rows;
}

export const FOLD_PROTEINS = 10;
export const POSITIONS_SHOWN = 5;
export const MODIFIED_ROWS_SHOWN = 6;
const MISSING_RUNS_SHOWN = 4;
const UNIT = { "RNA": "nt", "DNA": "nt", "DNA/RNA hybrid": "nt", "Protein": "aa" };

function residue(mon, num) {
    return num === null || num === undefined ? mon : `${mon}${num}`;
}

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

export const SEQUENCE_LINE = 60;

export function sequence_lines(sequence, residues = []) {
    if (!sequence) return null;
    let at = (r) => r?.auth ? `${r.code}${r.auth}` : r?.code;
    let lines = [];
    for (let start = 0; start < sequence.length; start += SEQUENCE_LINE) {
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

const SYNTHETIC_CONSTRUCT = 32630;
export const SOURCE_LISTED = 3;
const taxon_url = (id) => `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${id}`;

export const SOURCE_LEGEND = [
    { kind: "Natural",   text: "purified from the organism" },
    { kind: "Expressed", text: "gene cloned and produced in a host" },
    { kind: "Synthetic", text: "made chemically; the organism is where the sequence comes from" }
];

// Only genus and species are recased; a strain's capitals may be its own.
export function species_case(name) {
    if (!name || name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
    let words = name.split(" ");
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

export const PAIR_LINKS_SHOWN = 5;
const PAIR_GROUPS = [["au", "cWW A–U"], ["gc", "cWW G–C"], ["gu", "cWW G–U"], ["nc", "Others"]];
const au_label = (a_with) => "cWW A–" + (a_with.has("T") ? (a_with.has("U") ? "U/T" : "T") : "U");
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };

const by_chain = (a, b) => a.length - b.length || a.localeCompare(b);
const and_list = (xs) => xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;

export function family_name(family) {
    let [ct, e1, e2] = family;
    return `${ct === "c" ? "cis" : "trans"} ${EDGE[e1]} / ${EDGE[e2]}`;
}

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
            pair: `${p.res_1} – ${p.res_2}`, family: p.family, name: family_name(p.family),
            ends: [[p.label_1, p.copy_1, p.pos_1], [p.label_2, p.copy_2, p.pos_2]]
                .map(([label, copy, pos]) => `${strand_token(label, String(copy ?? IDENTITY))} ${pos}`)
        }))
    };
}

export const ARC_WIDTH = 300;
export const ARC_HEIGHT = 170;
export const ARC_HOVER_MAX = 500;   // above this, one path per kind and no hover text
const ARC_BASE = 146;    // y of the chain line; 5' and 3' sit below it
const ARC_TOP = 8;       // the widest arc peaks here
const ARC_PAD = 8;
const ARC_GAP = 16;      // between two strands, shrunk when there are many
const ARC_DOT = 2.4;
const ARC_BELOW = 56;    // the widest arc under the line reaches this far down
const PRIMES = ["′", "″", "‴"];
const IDENTITY = "1";    // struct_oper_id of the copy in the file
const by_copy = (a, b) => (b === IDENTITY) - (a === IDENTITY) || a.localeCompare(b, "en", { numeric: true });
const round1 = (v) => Math.round(v * 10) / 10;

// Operator: [r11, r12, r13, t1, r21, ..., t3], x' = R·x + t.
const compose = (a, b) => {            // a after b
    let m = [];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) m.push(a[4 * i] * b[j] + a[4 * i + 1] * b[4 + j] + a[4 * i + 2] * b[8 + j]);
        m.push(a[4 * i] * b[3] + a[4 * i + 1] * b[7] + a[4 * i + 2] * b[11] + a[4 * i + 3]);
    }
    return m;
};
const invert = (m) => {
    let [a, b, c, , d, e, f, , g, h, i] = m;
    let det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    let r = [e * i - f * h, c * h - b * i, b * f - c * e,
             f * g - d * i, a * i - c * g, c * d - a * f,
             d * h - e * g, b * g - a * h, a * e - b * d].map((v) => v / det);
    let t = [0, 1, 2].map((k) => -(r[3 * k] * m[3] + r[3 * k + 1] * m[7] + r[3 * k + 2] * m[11]));
    return [r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2]];
};
const same_op = (a, b) => a.every((v, k) => Math.abs(v - b[k]) <= 1e-3 * Math.max(1, Math.abs(v)));
const ONE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

const group_ids = (g) => g.split(",").flatMap((part) => {
    let m = /^(\d+)-(\d+)$/.exec(part);
    return m ? Array.from({ length: m[2] - m[1] + 1 }, (_, k) => String(Number(m[1]) + k)) : [part];
});

export function expression_ops(expr, opers) {
    let groups = expr.includes("(") ? [...expr.matchAll(/\(([^()]*)\)/g)].map((g) => g[1]) : [expr];
    let out = [{ key: "", m: ONE }];
    for (const g of groups.reverse()) {
        out = group_ids(g).flatMap((id) => {
            let m = opers.get(id);
            if (!m) throw new Error(`operator ${id} of ${expr} is not in the list`);
            return out.map((o) => ({ key: o.key ? `${id}×${o.key}` : id, m: compose(m, o.m) }));
        });
    }
    return out;
}

// Usually "1", but in 4NH6 operator 2 is the identity.
export const identity_op = (opers) =>
    [...(opers ?? new Map())].find(([, m]) => same_op(m, ONE))?.[0] ?? IDENTITY;

// A pair between copy a of X and copy b of Y holds in every copy g of X with the copy g·a⁻¹·b of Y.
export function assembly_pairs(assembly, opers, pairs) {
    let members = new Map();    // chain -> [{ key, m }] in file order
    for (const gen of assembly.gens) {
        let ops = expression_ops(gen.expr, opers);
        for (const chain of gen.chains) {
            let list = members.get(chain) ?? members.set(chain, []).get(chain);
            for (const op of ops) if (!list.some((o) => o.key === op.key)) list.push(op);
        }
    }
    let images = new Map();
    let images_of = (label_1, a_id, label_2, b_id) => {
        let key = `${label_1} ${a_id} ${label_2} ${b_id}`;
        if (images.has(key)) return images.get(key);
        let a = opers.get(a_id), b = opers.get(b_id);
        let found = [];
        if (a && b) {
            let a_to_b = compose(invert(a), b);
            for (const g of members.get(label_1) ?? []) {
                let want = compose(g.m, a_to_b);
                let h = (members.get(label_2) ?? []).find((o) => same_op(o.m, want));
                if (h) found.push([g.key, h.key]);
            }
        }
        images.set(key, found);
        return found;
    };
    let out = [];
    for (const p of pairs) {
        for (const [g, h] of images_of(p.label_1, String(p.copy_1 ?? IDENTITY), p.label_2, String(p.copy_2 ?? IDENTITY))) {
            out.push({ ...p, copy_1: g, copy_2: h });
        }
    }
    let own = new Map([...members].map(([chain, list]) =>
        [chain, (list.find((o) => same_op(o.m, ONE)) ?? list[0]).key]));
    let rank = new Map([...members].flatMap(([chain, list]) => list.map((o, k) => [`${chain} ${o.key}`, k])));
    return { pairs: out, own: (label) => own.get(label) ?? IDENTITY,
             rank: (label, copy) => rank.get(`${label} ${copy}`) ?? Infinity };
}

// Non-crossing arcs of most weight go above (weighted interval scheduling); WC and G-U weigh 2, others 1.
export function nested_set(arcs, weight) {
    let n = arcs.length;
    let by_end = arcs.map((_, k) => k).sort((x, y) => arcs[x][1] - arcs[y][1] || arcs[y][0] - arcs[x][0] || x - y);
    let ends = by_end.map((k) => arcs[k][1]);
    let first_end_at = (v) => {
        let lo = 0, hi = n;
        while (lo < hi) { let m = (lo + hi) >> 1; if (ends[m] < v) lo = m + 1; else hi = m; }
        return lo;
    };
    let inner = new Float64Array(n), pick = new Array(n);
    let schedule = (cands) => {
        let best = [0], from = [], end_at = [];
        for (let c = 0; c < cands.length; c++) {
            let k = cands[c], s = arcs[k][0];
            let lo = 0, hi = c;   // how many of the earlier ones end by s
            while (lo < hi) { let m = (lo + hi + 1) >> 1; if (end_at[m - 1] <= s) lo = m; else hi = m - 1; }
            let take = best[lo] + weight(k) + inner[k];
            if (take > best[c]) { best.push(take); from.push(lo); } else { best.push(best[c]); from.push(-1); }
            end_at.push(arcs[k][1]);
        }
        let chosen = [];
        for (let c = cands.length; c > 0;) {
            if (from[c - 1] === -1) { c--; continue; }
            chosen.push(cands[c - 1]);
            c = from[c - 1];
        }
        return [best[cands.length], chosen];
    };
    let order = arcs.map((_, k) => k).sort((x, y) => (arcs[x][1] - arcs[x][0]) - (arcs[y][1] - arcs[y][0]) || x - y);
    let done = new Uint8Array(n);
    for (const k of order) {
        let [a, b] = arcs[k];
        let cands = [];
        for (let c = first_end_at(a); c < n && ends[c] <= b; c++) {
            let j = by_end[c];
            if (done[j] && arcs[j][0] >= a) cands.push(j);
        }
        [inner[k], pick[k]] = schedule(cands);
        done[k] = 1;
    }
    let keep = new Set();
    let stack = schedule(by_end)[1];
    while (stack.length) {
        let k = stack.pop();
        keep.add(k);
        stack.push(...pick[k]);
    }
    return keep;
}

export function pair_arcs(entities, residues, pairs, view = {}) {
    let own = view.own ?? (() => view.identity ?? IDENTITY);
    let rank = view.rank ?? ((label, copy) => copy);
    let copy_order = (label) => (a, b) => (b === own(label)) - (a === own(label))
        || (typeof rank(label, a) === "number" ? rank(label, a) - rank(label, b)
            : String(a).localeCompare(String(b), "en", { numeric: true }));
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

    let ends_of = (p) => [{ label: p.label_1, copy: String(p.copy_1 ?? own(p.label_1)), pos: p.pos_1 },
                          { label: p.label_2, copy: String(p.copy_2 ?? own(p.label_2)), pos: p.pos_2 }];
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

    let strands = new Map();
    for (const e of drawn.flatMap((p) => p.ends)) {
        let key = `${e.label} ${e.copy}`;
        if (!strands.has(key)) strands.set(key, { ...chains.get(e.label), copy: e.copy });
    }
    let line = [...strands.values()].sort((x, y) => x.order - y.order || copy_order(x.label)(x.copy, y.copy));
    for (const c of line) {
        let others = line.filter((s) => s.label === c.label && s.copy !== own(c.label)).map((s) => s.copy);
        let rank = others.indexOf(c.copy);
        c.symmetry = c.copy !== own(c.label);
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
    let spans = drawn.map((p) => p.ends.map(index).sort((u, v) => u - v));
    let above = view.flat ? new Set(spans.keys()) : nested_set(spans, (k) => (drawn[k].kind === "nc" ? 1 : 2));
    drawn.forEach((p, k) => { p.below = !above.has(k); });

    // A cubic curve peaks at 3/4 of its control height.
    let reach = ARC_BASE - ARC_TOP - 3;
    let peak = (p) => {
        let [a, b] = p.ends.map(at).sort((u, v) => u - v);
        return [a, b, 3 + (p.below ? ARC_BELOW - 3 : reach) * (b - a) / room];
    };
    let arc = (p) => {
        let [a, b, h] = peak(p);
        let y = round1(ARC_BASE + (p.below ? 1 : -1) * h / 0.75);
        return `M${round1(a)} ${ARC_BASE}C${round1(a)} ${y} ${round1(b)} ${y} ${round1(b)} ${ARC_BASE}`;
    };
    let depth = Math.ceil(drawn.reduce((m, p) => (p.below ? Math.max(m, peak(p)[2]) : m), 0));
    let paths = { wc: "", gu: "", nc: "" };
    for (const p of drawn) paths[p.kind] += arc(p);

    let shown = new Map(line.map((c) => [`${c.label} ${c.copy}`, c.shown]));
    let named = (e, res) => `${shown.get(`${e.label} ${e.copy}`)}:${res ?? e.pos}`;
    let label = (p) => `${named(p.ends[0], p.res_1)} – ${named(p.ends[1], p.res_2)} · ${p.family}`;
    let each = drawn.length > ARC_HOVER_MAX ? null
             : drawn.map((p) => ({ kind: p.kind, d: arc(p), label: label(p) }));

    let layout = {
        strands: on_line,
        // [5′ end, other end, kind, label, LW family, name a, name b, 1 if under the line]
        pairs: drawn.map((p) => {
            let ends = [[p.ends[0], p.res_1], [p.ends[1], p.res_2]]
                .map(([e, res]) => ({ i: index(e), name: named(e, res) }))
                .sort((u, v) => u.i - v.i);
            let row = [ends[0].i, ends[1].i, p.kind, label(p), p.family, ends[0].name, ends[1].name];
            return p.below ? [...row, 1] : row;
        })
    };

    let dots = line.flatMap((c) => c.modified.filter((pos) => pos <= c.length).map((pos) => {
        let cx = round1(at({ label: c.label, copy: c.copy, pos }));
        return `M${round1(cx - ARC_DOT)} ${ARC_BASE}a${ARC_DOT} ${ARC_DOT} 0 1 0 ${2 * ARC_DOT} 0a${ARC_DOT} ${ARC_DOT} 0 1 0 ${-2 * ARC_DOT} 0`;
    }));

    return {
        width: ARC_WIDTH, height: ARC_HEIGHT + (depth && depth + 4), base: ARC_BASE,
        bottom: ARC_BASE + (depth && depth + 4), below: drawn.filter((p) => p.below).length,
        chains: line.map(({ label, copy, symmetry, shown, length, x1, x2 }) =>
            ({ label, copy, symmetry, name: shown, length, x1, x2 })),
        paths, each, layout,
        stroke: Math.round(Math.max(0.4, 1.7 * Math.min(1, Math.sqrt(40 / drawn.length))) * 100) / 100,
        dot_path: dots.join(""),
        counts: { drawn: drawn.length,
                  copies: line.filter((c) => c.symmetry).length, unplaced,
                  nucleotides: total, modified: dots.length }
    };
}

// 4V3P's assembly 1 has 37,145 pairs (5 MB of SVG), so large views are not drawn.
export const ARC_PAIR_MAX = 10000;
export const ARC_MANY_STRANDS = 24;
export const AU = "au";

const ASSEMBLY_TITLE = "The molecule as it works in the cell, as the depositors define it in the file";
const AU_TITLE = "The chains exactly as stored in the file";
const strand_count = (n) => (n === 1 ? "1 strand" : `${n} strands`);

function view_about(chosen, arcs, au) {
    let about = [];
    if (chosen.key !== AU) {
        let kept = new Set(arcs.chains.map((c) => c.label)).size;
        let filed = new Set(au?.chains.map((c) => c.label)).size;
        if (kept < filed) about.push(`The file holds ${strand_count(filed)}; ${chosen.label.toLowerCase()} uses ${kept} of them.`);
        let built = arcs.chains.filter((c) => c.symmetry).length;
        if (built) about.push(`${chosen.label} builds ${strand_count(built)} by symmetry, drawn dashed.`);
    }
    if (arcs.below) about.push("Under the line: pairs that cross the ones above.");
    return about;
}

export function arc_views(entities, residues, pairs, { assemblies = [], opers = new Map() } = {}, asked) {
    let identity = identity_op(opers);
    let views = [];
    for (const a of assemblies) {
        let v = assembly_pairs(a, opers, pairs);
        let too_big = v.pairs.length > ARC_PAIR_MAX;
        views.push({ key: a.id, label: `Assembly ${a.id}`, too_big, pairs: v.pairs.length, draw: [v.pairs, v],
                     arcs: too_big ? null : pair_arcs(entities, residues, v.pairs, { ...v, flat: true }) });
    }
    views.push({ key: AU, label: "Asymmetric unit", draw: [pairs, { identity }],
                 arcs: pair_arcs(entities, residues, pairs, { identity, flat: true }) });

    let drawn = views.filter((v) => v.arcs);
    let first = views.find((v) => v.arcs || v.too_big);   // the default when it can be drawn
    let chosen = drawn.find((v) => v.key === asked) ?? (first?.arcs ? first : drawn[0]) ?? null;
    let same = drawn.every((v) => JSON.stringify(v.arcs.layout) === JSON.stringify(drawn[0].arcs.layout));

    let note = null;
    if (chosen && first?.too_big && chosen.key === AU && asked !== AU) {
        note = { text: `${first.label} has ${first.pairs.toLocaleString("en-GB")} base pairs, too many to draw, so this is the asymmetric unit.` };
    } else if (chosen && chosen.key !== AU && chosen.arcs.chains.length > ARC_MANY_STRANDS) {
        note = { text: `${chosen.label} has ${chosen.arcs.chains.length} strands.`, link: AU, link_text: "The asymmetric unit is easier to read." };
    }
    let arcs = chosen ? pair_arcs(entities, residues, ...chosen.draw) : null;
    return {
        arcs,
        key: chosen?.key ?? AU,
        assembly: chosen && chosen.key !== AU,
        options: same ? [] : drawn.map(({ key, label }) => ({ key, label, current: key === chosen.key,
                                                             title: key === AU ? AU_TITLE : ASSEMBLY_TITLE })),
        note,
        about: arcs ? view_about(chosen, arcs, views.at(-1).arcs) : [],
        au: views.at(-1).arcs
    };
}

export function arc_summary(arcs) {
    if (!arcs) return null;
    return { strands: arcs.chains.length, nucleotides: arcs.counts.nucleotides,
             pairs: arcs.counts.drawn, modified: arcs.counts.modified,
             wc: arcs.layout.pairs.filter((p) => p[2] === "wc").length };
}

const THUMB_COLOURS = { wc: "#139068", gu: "#e0a030", nc: "#7f77dd" };
const xml = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// An <img> does not see the page CSS; the media query follows the surrounding page's color-scheme.
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
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 2 ${arcs.width} ${(arcs.bottom ?? arcs.base) + 4}" role="img" aria-label="${xml(pdb_id)}: ${arcs.counts.drawn} base pairs as arcs">`
         + THUMB_DARK
         + `<g stroke="#64748b" stroke-width="2.6" stroke-linecap="round" class="s">${lines}</g>`
         + `<g fill="none" stroke-width="${stroke}">${paths}</g>`
         + (arcs.dot_path ? `<path fill="#26215c" class="m" d="${arcs.dot_path}"/>` : "")
         + `</svg>`;
}

// RCSB's header layout: >1OB5_2|Chains B, D, F|TRANSFER-RNA, PHE|Saccharomyces cerevisiae (4932)
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

export function entry_fasta(entry_id, entities, { na_only = false } = {}) {
    let records = entities
        .filter((e) => !na_only || NUCLEIC_KINDS.has(e.kind))
        .map((e) => fasta_of(entry_id, e))
        .filter(Boolean);
    return records.length ? records.join("") : null;
}

export function fasta_choices(entities) {
    let sequenced = entities.filter((e) => e.sequence);
    return { all: sequenced.length,
             na: sequenced.filter((e) => NUCLEIC_KINDS.has(e.kind)).length };
}

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

const csv_cell = (v) => (/[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replaceAll('"', '""')}"` : String(v ?? ""));

export function base_pairs_csv(pairs) {
    return [PAIR_FIELDS, ...pairs.map((p) => PAIR_FIELDS.map((k) => p[k]))]
        .map((row) => row.map(csv_cell).join(",")).join("\n") + "\n";
}

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

const LBN_BRACKETS = ["()", "[]", "{}", "<>", "Aa", "Bb", "Cc", "Dd"];
const LBN_FAMILIES = ["cWH", "cWS", "cHW", "cHH", "cHS", "cSW", "cSH", "cSS",
                      "tWW", "tWH", "tWS", "tHW", "tHH", "tHS", "tSW", "tSH", "tSS"];
const LBN_SEP = "&";
export const flip_lw = (f) => f[0] + f[2] + f[1];
const crosses = ([i, j], [k, l]) => (i < k && k < j && j < l) || (k < i && i < l && l < j);
const strand_token = (label, copy) => (copy === IDENTITY ? label : `${label}:${copy}`);

export function nucleotide_letter(r) {
    let base = String(r.parent ?? r.code ?? "").replace(/^D(?=[ACGTU]$)/, "");
    let letter = /^[ACGTUI]$/.test(base) ? base : "N";
    return r.modified ? letter.toLowerCase() : letter;
}

// One stack of open pairs per level keeps this linear.
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

export const MAP_STRANDS = 8;

function linked_strands(strands) {
    let by_key = new Map(strands.map((s) => [s.key, s]));
    let first = strands.find((s) => s.partners.size) ?? strands[0];
    let reached = [first.key];
    for (let n = 0; n < reached.length && reached.length < MAP_STRANDS; n++) {
        for (const k of by_key.get(reached[n]).partners) {
            if (reached.length < MAP_STRANDS && by_key.has(k) && !reached.includes(k)) reached.push(k);
        }
    }
    return reached;
}

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
    if (!chosen.length) chosen = linked_strands(strands);
    let shown = strands.filter((s) => chosen.includes(s.key));

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
        cols: cols.map((c) => c && [c.letter, c.num, c.seen ? 1 : 0, c.code, c.pos]),
        rows: rows.map(({ name, family, text, pairs, overflow }) => ({ name, family, text, pairs, overflow: !!overflow })),
        steps,
        seq
    };
}

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

// Canonical pairs only (cWW A-U, G-C, G-U); pairs with a symmetry copy are left out.
export function dot_bracket_record(pdb_id, chains, pairs) {
    let start = new Map();
    let width = 0;
    let seps = new Set();
    chains.forEach((c, n) => {
        if (n) seps.add(width++);
        start.set(c.asym, width);
        width += c.sequence.length;
    });
    let length = new Map(chains.map((c) => [c.asym, c.sequence.length]));
    let at = (asym, pos) => (pos >= 1 && pos <= (length.get(asym) ?? 0) ? start.get(asym) + pos - 1 : undefined);

    let placed = pairs.map((p) => [at(p.asym_1, p.pos_1), at(p.asym_2, p.pos_2)])
        .filter(([i, j]) => i !== undefined && j !== undefined && i !== j)
        .map(([i, j]) => (i < j ? [i, j] : [j, i]))
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let used = new Set();
    let kept = [];
    for (const [i, j] of placed) {
        if (used.has(i) || used.has(j)) continue;
        used.add(i).add(j);
        kept.push([i, j]);
    }

    let names = chains.map((c) => c.auth ?? c.asym);
    return `>${pdb_id}|${names.length === 1 ? "Chain" : "Chains"} ${names.join(", ")}\n` +
           `${chains.map((c) => c.sequence).join(LBN_SEP)}\n` +
           `${bracket_line(width, seps, kept)}\n`;
}
