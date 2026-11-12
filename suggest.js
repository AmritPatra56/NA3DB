// suggest.js - "Did you mean" for a search that found nothing.
//
// Built from the words the database itself holds, so it can only ever offer
// a word some entry contains, and every offer carries the real count it would
// return. Nothing is corrected behind the user's back: a search for ribozome
// still answers 0, with ribosome and ribozyme offered as links.
// NCBI PubMed does the same (ESpell); RCSB, PDBe and UniProt offer nothing.

import { query } from "./db.js";
import { clean_text, singular, count_entries, organism_suggestions, ligand_suggestions, nonstandard_suggestions } from "./search.js";
import { taxa_named, name_key } from "./taxonomy.js";

// Every word of every entry's searchable text, with how many entries hold it.
// The same normalising as doc.prose: lower case, punctuation dropped.
const VOCABULARY = `
    SELECT w, count(DISTINCT id)::int AS n FROM (
        SELECT id, regexp_split_to_table(
                   prose || ' ' || regexp_replace(lower(coalesce(entities, '') || ' ' || coalesce(residues, '')),
                                                  E'[^a-z0-9 \\n]', '', 'g'),
                   E'\\\\s+') AS w
          FROM doc) x
     WHERE length(w) >= 3
     GROUP BY w`;

// doc changes only when a load refreshes it; this notices that in ~2 ms.
const SIGNATURE = `SELECT count(*)::text || ' ' || coalesce(sum(hashtext(prose))::text, '0') AS s FROM doc`;
const CHECK_MS = 60 * 1000;

let vocab = null;
let checked = 0;
let pending = null;

export async function vocabulary(q = query) {
    if (vocab && Date.now() - checked < CHECK_MS) return vocab;
    pending ??= (async () => {
        try {
            let sig = (await q(SIGNATURE)).rows[0].s;
            if (!vocab || vocab.signature !== sig) {
                let rows = (await q(VOCABULARY)).rows;
                vocab = { signature: sig, words: new Map(rows.map((r) => [r.w, r.n])) };
            }
            checked = Date.now();
            return vocab;
        } finally {
            pending = null;
        }
    })();
    return pending;
}

// Typing distance with a swap of two neighbours counted as one slip
// (optimal string alignment). Gives up early once past the cap.
export function distance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let cur = [i], low = i;
        for (let j = 1; j <= b.length; j++) {
            let c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                c = Math.min(c, prev2[j - 2] + 1);
            }
            cur.push(c);
            low = Math.min(low, c);
        }
        if (low > cap) return cap + 1;
        prev2 = prev;
        prev = cur;
    }
    return prev[b.length];
}

// One slip in a short word, two in a long one. Shorter words are not
// corrected at all: tna is one slip from rna, dna, tra and many more.
const MIN_LENGTH = 4;
const slips = (word) => (word.length <= 7 ? 1 : 2);

// Words the search would find as they are. The box matches inside words, so
// a word is known if any database word contains it (or its singular).
function known(word, words) {
    let one = singular(word);
    for (const w of words.keys()) {
        if (w.includes(word) || w.includes(one)) return true;
    }
    return false;
}

// The closest database words, commonest first. Only the fewest slips count:
// nucleosme offers nucleosome, not nuclease two slips away. A word holding
// another offer is dropped, since the box matches inside words and the shorter
// finds it anyway: ribosomes, and gquadruplex (G-quadruplex) beside quadruplex.
export function closest(word, words, limit = 3) {
    let cap = slips(word), found = [];
    for (const [w, n] of words) {
        let d = distance(word, w, cap);
        if (d <= cap) found.push({ w, n, d });
    }
    let best = Math.min(...found.map((f) => f.d));
    found = found.filter((f) => f.d === best);
    return found
        .filter((f) => !found.some((g) => g !== f && f.w.includes(g.w)))
        .sort((a, b) => b.n - a.n)
        .slice(0, limit);
}

// Past this many unknown words the search is not a typo but something else.
const MAX_UNKNOWN = 3;
const MAX_TRIED = 9;
const MAX_OFFERED = 3;

// Keeps the capital a word was typed with: Ribozome -> Ribosome.
function as_typed(typed, word) {
    return /^[A-Z]/.test(typed) ? word[0].toUpperCase() + word.slice(1) : word;
}

// Up to three corrected searches, each { field, value, total }, best first:
// the box to change, what to put in it, and what that would find. Every other
// filter in the query is kept, so each total is what the link will show.
// Empty when nothing close exists. Asked only of a search that found nothing.
export async function did_you_mean(query_params, q = query) {
    if (query_params.match === "excludes") return [];
    let offers = [...await search_box_offers(query_params, q), ...await organism_offers(query_params)];
    return offers.slice(0, MAX_OFFERED);
}

// The organism boxes take a whole name, so the whole name is compared with
// every scientific and common name we hold: mus musculas, Mus musculus.
const ORGANISM_BOXES = { source_organism: "source_organisms", expression_host: "expression_hosts" };

async function organism_offers(query_params) {
    let offers = [];
    for (const [field, role] of Object.entries(ORGANISM_BOXES)) {
        let typed = clean_text(String(query_params[field] ?? ""));
        let key = name_key(typed);
        if (key.length < MIN_LENGTH || taxa_named(typed).length > 0) continue;

        let cap = slips(key);
        let close_rows = (await organism_suggestions(role))
            .map((row) => ({
                row,
                d: Math.min(...[row.code, ...row.name.split(", ")].filter(Boolean)
                    .map((n) => distance(key, name_key(n), cap)))
            }))
            .filter((c) => c.d <= cap);
        let best = Math.min(...close_rows.map((c) => c.d));
        let picks = close_rows.filter((c) => c.d === best)
            .sort((a, b) => b.row.entries - a.row.entries).slice(0, MAX_OFFERED);

        for (const { row } of picks) {
            let total = await count_entries({ ...query_params, [field]: row.code });
            if (total > 0) offers.push({ field, value: row.code, total });
        }
    }
    return offers;
}

async function search_box_offers(query_params, q) {
    let text = clean_text(String(query_params.q ?? ""));
    if (!text) return [];

    let { words } = await vocabulary(q);

    // Each word as typed, where it sits, and its normalised form.
    let tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)]
        .map((m) => ({ typed: m[0], at: m.index, word: m[0].toLowerCase() }))
        .filter((t) => t.word.length >= MIN_LENGTH && !known(t.word, words));

    if (tokens.length === 0 || tokens.length > MAX_UNKNOWN) return [];

    let options = tokens.map((t) => closest(t.word, words));
    if (options.some((o) => o.length === 0)) return [];

    // Every combination of the closest words, fewest slips first.
    let combos = [[]];
    for (const o of options) combos = combos.flatMap((c) => o.map((x) => [...c, x]));
    combos = combos
        .map((c) => ({ picks: c, slips: c.reduce((s, x) => s + x.d, 0) }))
        .sort((a, b) => a.slips - b.slips)
        .slice(0, MAX_TRIED);

    let offers = await Promise.all(combos.map(async ({ picks, slips }) => {
        // Replaced from the end, so earlier positions stay right.
        let fixed = text;
        for (let i = tokens.length - 1; i >= 0; i--) {
            let t = tokens[i];
            fixed = fixed.slice(0, t.at) + as_typed(t.typed, picks[i].w) + fixed.slice(t.at + t.typed.length);
        }
        let total = await count_entries({ ...query_params, q: fixed });
        return { q: fixed, total, slips };
    }));

    let seen = new Set();
    return offers
        .filter((o) => o.total > 0 && !seen.has(o.q) && seen.add(o.q))
        .sort((a, b) => a.slips - b.slips || b.total - a.total)
        .slice(0, MAX_OFFERED)
        .map(({ q, total }) => ({ field: "q", value: q, total }));
}

// ---------------------------------------------------------------------------
// Suggestions under the search box, as you type: the authors, organisms and
// molecules the database holds whose name has a word starting with the text,
// and entries whose id starts with it. RCSB, PDBe, UniProt and NAKB all do
// this; the rules here are the ones that keep it honest:
//   - only names that exist, written exactly as stored ("Berman, D."), never
//     merged or expanded: nobody can tell whether Chen, S. is Chen, S.J.
//   - each with the count picking it returns, counted by count_entries with
//     the filters in use, so the number is the search; 0 is never offered
//   - picking fills the box with the name in quotes, an exact phrase; Enter
//     without picking still runs what was typed

// Lines of the doc view: one author, organism or molecule per line, with the
// entries holding each. Case-folded, keeping the commonest spelling.
const NAME_LINES = `
    SELECT 'authors' AS kind, trim(x) AS name, array_agg(DISTINCT id) AS ids
      FROM doc, unnest(string_to_array(authors, E'\\n')) x WHERE trim(x) <> '' GROUP BY 2
    UNION ALL
    SELECT 'molecules', trim(x), array_agg(DISTINCT id)
      FROM doc, unnest(string_to_array(entities, E'\\n')) x WHERE trim(x) <> '' GROUP BY 2`;

let names = null;
let names_checked = 0;
let names_pending = null;

// Read once at start-up, so the first person to type does not wait ~1 s.
export const warm_box_names = (q = query) => box_names(q).catch(() => {});

async function box_names(q) {
    if (names && Date.now() - names_checked < CHECK_MS) return names;
    names_pending ??= (async () => {
        try {
            let sig = (await q(SIGNATURE)).rows[0].s;
            if (!names || names.signature !== sig) {
                let by = { authors: new Map(), molecules: new Map() };
                for (const r of (await q(NAME_LINES)).rows) {
                    // A quote cannot sit inside a quoted phrase, and a long
                    // systematic name ("[[[(2R,3S,4R,5R)-5-(6-aminopurin-...")
                    // is nothing anyone types.
                    if (r.name.includes("\"") || r.name.length > LONGEST_NAME) continue;
                    let key = r.name.toLowerCase();
                    let seen = by[r.kind].get(key);
                    if (!seen) by[r.kind].set(key, { name: r.name, ids: new Set(r.ids), best: r.ids.length });
                    else {
                        r.ids.forEach((id) => seen.ids.add(id));
                        if (r.ids.length > seen.best) Object.assign(seen, { name: r.name, best: r.ids.length });
                    }
                }
                let ids = (await q(`SELECT id FROM doc ORDER BY id`)).rows.map((r) => r.id);
                let chemical = (r) => ({ code: r.code, name: r.code, also: r.name ?? "", held: r.entries });
                names = {
                    signature: sig, ids,
                    authors:   [...by.authors.values()].map((n) => ({ name: n.name, held: n.ids.size })),
                    residues:  (await nonstandard_suggestions(q)).map(chemical),
                    ligands:   (await ligand_suggestions(q)).map(chemical)
                };
                // A ligand is also an entity, named the same: offered once,
                // as the ligand. A sequence written out as a name,
                // "RNA(5'-R(*AP*UP*(PSU)P*...)-3')", is nothing anyone types.
                let chemicals = new Set([...names.residues, ...names.ligands].map((r) => r.also.toLowerCase()));
                names.molecules = [...by.molecules.values()]
                    .filter((n) => !chemicals.has(n.name.toLowerCase()) && !n.name.includes("*"))
                    .map((n) => ({ name: n.name, held: n.ids.size }));
            }
            names_checked = Date.now();
            return names;
        } finally {
            names_pending = null;
        }
    })();
    return names_pending;
}

const LONGEST_NAME = 60;
export const BOX_MIN_LENGTH = 2;
const PER_GROUP = 3;
// Tried per group before counting, so filters that zero some still leave three.
const TRIED = 6;
const IDS_SHOWN = 4;

// 0 when the name starts with the text, 1 when a later word does, else null.
// Words split on anything not a letter or digit, so "west" finds
// Patterson-West, J. after Westhof, E.
export function word_start(name, text) {
    let lower = name.toLowerCase();
    if (lower.startsWith(text)) return 0;
    let at = lower.indexOf(text);
    while (at > 0) {
        if (!/[a-z0-9]/.test(lower[at - 1])) return 1;
        at = lower.indexOf(text, at + 1);
    }
    return null;
}

// "Jiri Sponer", "H. M. Berman": a typed person, as the stored names it can
// be. Family name whole, initials in order from the first.
function as_person(text) {
    let words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 3 || !words.every((w) => /^[a-z][a-z'-]*\.?$/.test(w))) return null;
    let family = words.at(-1);
    if (family.endsWith(".") || family.length < 2) return null;
    return { family, initials: words.slice(0, -1).map((w) => w[0]).join("") };
}

function is_person(name, person) {
    let [family, given = ""] = name.toLowerCase().split(/,\s*/);
    return family === person.family && given.replace(/[^a-z]/g, "").startsWith(person.initials);
}

// The best few, one per spelling: tRNA-fMet and tRNA(fMet) are one offer.
function best(rows, rank, limit) {
    let seen = new Set();
    return rows.map((r) => [rank(r), r])
        .filter(([k]) => k !== null)
        .sort(([ka, a], [kb, b]) => ka - kb || b.held - a.held || a.name.localeCompare(b.name))
        .map(([, r]) => r)
        .filter((r) => {
            let key = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            return !seen.has(key) && seen.add(key);
        })
        .slice(0, limit);
}

// How a typed word is closest to a name: the fewest slips to one of its
// words, whole or as far as typed (westo is one slip from westh-of). null
// past the slips a word that long may have.
function near(name, text) {
    let cap = slips(text), found = null;
    for (const word of name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length < MIN_LENGTH) continue;
        let d = Math.min(distance(text, word, cap), distance(text, word.slice(0, text.length), cap));
        if (d <= cap && (found === null || d < found)) found = d;
    }
    return found;
}

// A modified residue or ligand by its code, or a word of its name.
function chemical_rank(r, lower) {
    let code = r.code.toLowerCase();
    if (code === lower) return -1;
    if (code.startsWith(lower)) return 0;
    return word_start(r.also ?? "", lower) === null ? null : 1;
}

// The boxes a pick fills, and where a group sits in the list.
const FILTER_OF = { residues: "nonstandard_residue", ligands: "ligand" };
const ORDER = ["authors", "organisms", "residues", "ligands", "molecules"];

export async function box_suggestions(query_params, q = query) {
    let text = clean_text(String(query_params.q ?? ""));
    // A quote means the reader is writing the exact phrase themselves.
    if (text.length < BOX_MIN_LENGTH || text.includes("\"")) return { text, groups: [] };
    let lower = text.toLowerCase();

    let held = await box_names(q);
    // Two letters name too much, except a code typed whole: MG, ZN, NA.
    if (text.length < 3) {
        let code = (r) => (r.code.toLowerCase() === lower ? 0 : null);
        let rows = { residues: held.residues, ligands: held.ligands };
        return { text, groups: await counted_groups(query_params, rows, { residues: code, ligands: code }) };
    }
    let person = as_person(lower);

    let organisms = (await organism_suggestions("source_organisms")).map((o) => ({
        name: o.code, also: o.name, held: o.entries
    }));
    // Mouse finds Mus musculus by its common name, as taxonomy.js reads one:
    // by its last word, where English puts the thing named, so mouse finds
    // "house mouse" but not Arabidopsis, the "mouse-ear cress".
    let organism_rank = (o) => {
        let common = (o.also ?? "").toLowerCase().split(/,\s*/).filter(Boolean);
        // Named whole, by either name, first: human is Homo sapiens before
        // it is Human immunodeficiency virus.
        if (o.name.toLowerCase() === lower || common.includes(lower)) return -1;
        let own = word_start(o.name, lower);
        if (own !== null) return own;
        return common.some((c) => c.startsWith(lower) && !/[ -]/.test(c.slice(lower.length).trimEnd())
                                  || c.split(" ").at(-1).startsWith(lower)) ? 1 : null;
    };

    let ranks = {
        authors:   (r) => word_start(r.name, lower) ?? (person && is_person(r.name, person) ? 0 : null),
        organisms: organism_rank,
        residues:  (r) => chemical_rank(r, lower),
        ligands:   (r) => chemical_rank(r, lower),
        molecules: (r) => word_start(r.name, lower)
    };
    let rows = { authors: held.authors, organisms, residues: held.residues, ligands: held.ligands, molecules: held.molecules };

    let groups = await counted_groups(query_params, rows, ranks);

    // Nothing starts with it: a slip, perhaps. One word of four letters or
    // more, the same slips "Did you mean" allows; westof offers Westhof, E.
    let near_miss = false;
    if (groups.length === 0 && /^[a-z0-9]+$/.test(lower) && lower.length >= MIN_LENGTH) {
        let close = (name, also) => {
            let d = [near(name, lower), also ? near(also, lower) : null].filter((x) => x !== null);
            return d.length ? Math.min(...d) : null;
        };
        groups = await counted_groups(query_params, rows, Object.fromEntries(ORDER.map((kind) =>
            [kind, (r) => close(r.code ?? r.name, r.also)])));
        near_miss = groups.length > 0;
    }

    // An id opens its entry, so it is not counted: it is one entry.
    if (/^[0-9][a-z0-9]{2,3}$/i.test(text)) {
        let upper = text.toUpperCase();
        let ids = held.ids.filter((id) => id.startsWith(upper)).slice(0, IDS_SHOWN);
        if (ids.length) groups.unshift({ kind: "entries", items: ids.map((id) => ({ value: id, label: id, href: `/structure/${id}` })) });
    }
    return { text, groups, ...(near_miss ? { near: true } : {}) };
}

// Each group's best few, counted as the search the pick runs: a name quoted
// in the box, or a residue or ligand code in its own filter, every other
// filter as it is. In parallel; each count is a few milliseconds.
async function counted_groups(query_params, rows, ranks) {
    let groups = await Promise.all(ORDER.filter((kind) => rows[kind]).map(async (kind) => {
        let tried = best(rows[kind], ranks[kind], TRIED);
        let filter = FILTER_OF[kind];
        let asks = tried.map((r) => (filter
            ? { ...query_params, q: "", [filter]: r.code }
            : { ...query_params, q: `"${r.name}"` }));
        let totals = await Promise.all(asks.map((a) => count_entries(a)));
        let items = tried.map((r, i) => ({
            ...(filter ? { filter, value: r.code, label: r.code } : { value: `"${r.name}"`, label: r.name }),
            ...(r.also ? { also: r.also } : {}),
            total: totals[i]
        })).filter((item) => item.total > 0).slice(0, PER_GROUP);
        return { kind, items };
    }));
    return groups.filter((g) => g.items.length);
}
