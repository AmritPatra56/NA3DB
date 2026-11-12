// build_citations.mjs - one checked reference per entry, from the records
// fetch_citations.mjs saved. Writes citations.json; nothing in Postgres
// changes, it is only read for each entry's DOI and PMID.
//
//   node --env-file=.env db/build_citations.mjs
//
// Neither source is right on its own. On our entries Crossref had no title
// and the corresponding author first for Nature Struct. Biol. 1999-2001, and
// "Edited by" notes in Elsevier titles; PubMed puts Science's section heading
// before a title and abbreviates last pages ("143-56"). So each field comes
// from the source that keeps it best, and the two check each other:
//
//   title, authors, abstract, keywords   PubMed (curated by the NLM)
//   given names                          Crossref, if its surnames are PubMed's, in order
//   journal, volume, issue, pages, ISSN  Crossref (the publisher), then PubMed
//
// A paper the sources disagree on, and no rule settles, is held back and
// listed: the entry keeps the PDB's citation until REVIEWED says otherwise.
// An entry with no DOI or PMID keeps the PDB's citation.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const CACHE = fileURLToPath(new URL("./citation_cache/", import.meta.url));
const OUT = new URL("../citations.json", import.meta.url);

// Papers held back for review that were checked by hand and accepted, with why.
export const REVIEWED = {};

// Entries the PDB still lists as "To be published", or without a DOI or
// PMID, matched to their paper by fetch_citations.mjs's title search and
// confirmed by a person: entry id to the paper's DOI.
// Confirmed 2026-11-12. Left out: 7DFG, whose one candidate is a preprint
// titled "nucleoside drugs" where the PDB says "nucleotide drugs".
export const MATCHES = {
    "1EEK": "10.1021/ja994164v",                  // JACS 2000, as the PDB says; same 3 authors
    "363D": "10.1021/ja971962h",                  // JACS 1998, as the PDB says; same 3 authors
    "386D": "10.1021/ja981761t",                  // JACS 1998, as the PDB says; same 7 authors
    "2K3Z": "10.3998/ark.5550190.0010.311",       // ARKIVOC 2008, as the PDB says; same 4 authors
    "7OA5": "10.1016/s1097-2765(00)80280-4",      // Mol. Cell 1998, as the PDB says (deposited 2021)
    "5EMC": "10.1038/srep29119",                  // same title; Jin and Lian first, as in the PDB
    "9DXH": "10.1016/j.molcel.2026.09.028",       // the journal paper, not the 2025 preprint
    "9DXK": "10.1016/j.molcel.2026.09.028"
};

// Entries without a DOI or PMID whose paper PubMed links to the entry
// itself (its DataBankList, found by searching PDB/{id}[si]), with the
// PDB's authors; the titles changed before publication, so the title search
// missed them. Confirmed 2026-11-12. Left out: 3U2E, whose link is a 2018
// paper by other authors that uses the structure.
export const PUBMED_MATCHES = {
    "3HX0": { pmid: 19701199, doi: "10.1038/nsmb.1654" },         // Nat Struct Mol Biol 2009; same 9 authors
    "3Q8S": { pmid: 21300901, doi: "10.1073/pnas.1013909108" },   // PNAS 2011; same 2 authors
    "3TZR": { pmid: 22431596, doi: "10.1073/pnas.1118699109" },   // PNAS 2012; same 7 authors
    "4K27": { pmid: 24341895, doi: "10.1021/cb4007387" }          // ACS Chem Biol 2014; same 9 authors
};

// Titles no source has right, written as the journal prints them.
export const TITLES = {
    // PubMed has the subtitle in capitals (JBC prints it in small capitals);
    // Crossref drops it; the PDB has the title from before publication.
    "4UNO": "Structures of the Ets Protein DNA-binding Domains of Transcription Factors Etv1, Etv4, Etv5, and Fev: Determinants of DNA Binding and Redox Regulation by Disulfide Bond Formation"
};

// ── text ────────────────────────────────────────────────────────────────────

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s) {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m);
}

// Markup out, text kept: "Mg<sup>2+</sup>" is "Mg2+". A sub- or superscript
// joins the word before it even across a line break ("Ag\n<sub>16</sub>" is
// Ag16). Whitespace collapsed.
export const plain = (s) => s == null ? null
    : decode(s.replace(/\s*<(sub|sup)>\s*([\s\S]*?)\s*<\/\1>/g, "$2").replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ").trim() || null;

// For comparing, not showing: letters and digits only, accents and Greek
// spelled out, so "Pol η" is "Pol eta" and "Andrałojć" is "Andralojc".
const GREEK = Object.fromEntries([..."αβγδεζηθικλμνξοπρστυφχψω"].map((ch, i) =>
    [ch, "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ")[i]]));
export function key(s) {
    return (plain(s) ?? "").toLowerCase()
        .replace(/[α-ω]/g, (ch) => GREEK[ch] ?? ch).replace(/ς/g, "sigma")
        // Old MEDLINE titles write "2.5 A" for 2.5 Å and "G x A" for G·A.
        .replace(/(?<=\b[a-z0-9]) x (?=[a-z0-9(]\b)/g, "").replace(/å/g, "a").replace(/[łŁ]/g, "l").replace(/[øØ]/g, "o").replace(/ß/g, "ss")
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// ── PubMed XML ──────────────────────────────────────────────────────────────
// The fields read here are never nested in themselves, so a tag's first match
// is its element. Author lists are read inside <AuthorList> only, so
// investigators and cited papers stay out.

const first = (xml, tag) => xml?.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;
const all = (xml, tag) => [...(xml ?? "").matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))]
    .map((m) => ({ attrs: m[1] ?? "", body: m[2] }));
const attr = (attrs, name) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

// "143-56" is pages 143 to 156: MEDLINE drops the leading digits they share.
// Cell Press ends a range in its supplement pages: "85-95.e3".
export function expand_pages(pgn) {
    let m = pgn?.match(/^\s*([A-Za-z]*\d+)\s*[-–]\s*([A-Za-z]*\d+(?:\.e\d+)?)\s*$/);
    if (!m) return { first: plain(pgn), last: null };
    let [, a, b] = m;
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && b.length < a.length) b = a.slice(0, a.length - b.length) + b;
    return { first: a, last: b };
}

export function read_pubmed(xml) {
    let article = first(xml, "Article");
    let journal = first(article, "Journal");
    let issue = first(journal, "JournalIssue");
    let pubdate = first(issue, "PubDate");
    let pagination = first(article, "Pagination");
    let pages = first(pagination, "StartPage")
        ? { first: plain(first(pagination, "StartPage")), last: plain(first(pagination, "EndPage")) }
        : expand_pages(first(pagination, "MedlinePgn"));
    let authors = all(first(article, "AuthorList"), "Author").map(({ body }) => {
        let collective = plain(first(body, "CollectiveName"));
        if (collective) return { name: collective };
        let orcid = all(body, "Identifier").find((i) => attr(i.attrs, "Source") === "ORCID");
        return {
            family: plain(first(body, "LastName")),
            given: plain(first(body, "ForeName")),
            initials: plain(first(body, "Initials")),
            suffix: plain(first(body, "Suffix")),
            orcid: orcid ? plain(orcid.body).replace(/^https?:\/\/orcid\.org\//, "") : null
        };
    });
    let abstract = all(first(article, "Abstract"), "AbstractText").map(({ attrs, body }) => {
        let label = attr(attrs, "Label");
        // Some sections open with a stray ". " from conversion.
        return (label ? `${decode(label)}: ` : "") + (plain(body) ?? "").replace(/^[.\s]+/, "");
    }).join(" ") || null;
    let title = plain(first(article, "ArticleTitle"));
    let doi = all(first(xml, "ArticleIdList"), "ArticleId").find((a) => attr(a.attrs, "IdType") === "doi");
    return {
        pmid: plain(first(xml, "PMID")),
        title: title && !/^\[?not available\]?\.?$/i.test(title) ? title : null,
        journal: plain(first(journal, "Title")),
        journal_abbrev: plain(first(journal, "ISOAbbreviation")),
        issn: plain(first(journal, "ISSN")),
        volume: plain(first(issue, "Volume")),
        issue: plain(first(issue, "Issue")),
        year: Number((plain(first(pubdate, "Year")) ?? plain(first(pubdate, "MedlineDate")) ?? "").match(/\d{4}/)?.[0]) || null,
        pages,
        authors,
        complete: attr(xml.match(/<AuthorList(\s[^>]*)?>/)?.[1] ?? "", "CompleteYN") !== "N",
        abstract,
        keywords: all(first(xml, "KeywordList"), "Keyword").map((k) => plain(k.body)).filter(Boolean),
        doi: doi ? plain(doi.body) : null
    };
}

// ── Crossref JSON ───────────────────────────────────────────────────────────

const year_of = (d) => d?.["date-parts"]?.[0]?.[0] ?? null;

// Crossref titles carry what typesetting left: "Edited by" footnotes from
// Elsevier ("...telomere 1 1Edited by I. Tinoco") and ACS codes (".ANG.").
const ACS = { ANG: "Å", cntdot: "·", alpha: "α", beta: "β", gamma: "γ", delta: "δ", DELTA: "Δ", mu: "μ", pi: "π" };
export function clean_crossref_title(t) {
    return t == null ? null : t
        .replace(/\s*[\d\s]*Edited by\b.*$/, "")
        .replace(/\.([A-Za-z]+)\./g, (m, name) => ACS[name] ?? m)
        // Old J. Mol. Biol. set decimals with a raised point: "2·25 Å".
        .replace(/(\d)·(\d)/g, "$1.$2")
        .trim() || null;
}

export function read_crossref(m) {
    let title = clean_crossref_title(plain(m.title?.[0]));
    let subtitle = plain(m.subtitle?.[0]);
    let print = m["issn-type"]?.find((t) => t.type === "print")?.value;
    let online = m["issn-type"]?.find((t) => t.type === "electronic")?.value;
    let page = plain(m.page);
    let pages = page ? expand_pages(page) : { first: null, last: null };
    // A preprint's server is its "institution"; a chapter's container is the
    // series, then the book ("Methods in Molecular Biology", "Nucleic Acid
    // Crystallography").
    let type = m.type === "posted-content" ? "preprint" : m.type === "book-chapter" ? "chapter" : "article";
    let containers = (m["container-title"] ?? []).map(plain);
    return {
        type,
        title: title && subtitle ? `${title}: ${subtitle}` : title,
        journal: type === "preprint" ? plain(m.institution?.[0]?.name) ?? containers[0] : containers[0],
        book_title: type === "chapter" ? containers[1] ?? null : null,
        isbn: type === "chapter" ? m.ISBN?.[0] ?? null : null,
        journal_abbrev: plain(m["short-container-title"]?.[0]),
        issn: print ?? online ?? m.ISSN?.[0] ?? null,
        volume: plain(m.volume),
        issue: plain(m.issue),
        year: year_of(m["published-print"]) ?? year_of(m.issued),
        pages,
        // Nucleic Acids Res. gives its manuscript id ("gkv826") here, so it is
        // used only when no source has a page.
        article_number: plain(m["article-number"]),
        authors: (m.author ?? []).map((a) => a.family
            ? { family: plain(a.family), given: plain(a.given), orcid: a.ORCID?.replace(/^https?:\/\/orcid\.org\//, "") ?? null }
            : { name: plain(a.name) }),
        doi: m.DOI,
        publisher: plain(m.publisher)
    };
}

// ── choosing ────────────────────────────────────────────────────────────────

// "Pradeep S" as "Pradeep S.": a lone capital in a given name is an initial.
// A full stop after a whole name is a typo ("José. A.", 6FZS at Crossref).
const given_name = (g) => g?.replace(/(^|[\s-])(\p{Lu})(?=$|[\s-])/gu, "$1$2.")
    .replace(/(\p{L}\p{Ll}+)\.(?=\s)/gu, "$1") ?? null;

const surnames = (authors) => authors.map((a) => key(a.family ?? a.name));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// PubMed's order and surnames; Crossref's given name where PubMed has only
// initials ("P" for Poul) and the two lists are the same people in order.
function choose_authors(pm, cr) {
    if (!pm || pm.authors.length === 0) return cr?.authors ?? [];
    if (!cr || !same(surnames(pm.authors), surnames(cr.authors))) return pm.authors;
    return pm.authors.map((a, i) => {
        let c = cr.authors[i];
        let fuller = c.given && a.given && key(c.given).length > key(a.given).length && key(c.given)[0] === key(a.given)[0];
        return { ...a, given: fuller ? c.given : a.given, orcid: a.orcid ?? c.orcid ?? null };
    });
}

// "2.5 A" back to "2.5 Å" where Crossref, from the publisher, has the Å:
// only when both have the same number of them, so each is the same one.
export function restore_angstrom(title, publisher_title) {
    let found = [...title.matchAll(/(\d)( ?-? ?)[Aa]\b(?![-'])/g)];
    let want = (publisher_title?.match(/[Åå]/g) ?? []).length;
    return found.length && found.length === want ? title.replace(/(\d)( ?-? ?)[Aa]\b(?![-'])/g, "$1$2Å") : title;
}

// The publisher's text, when it is PubMed's title word for word: same words,
// split at the same places, and no capital PubMed has made small. Then the
// publisher's dashes, symbols and capitals stand ("Cys-tRNACys–EF-Tu–GDPNP",
// "Pol η", Title Case where the NLM made it sentence case). Otherwise not: it
// can run words into italics ("the<i>syn</i>") or lose capitals ("pax").
export function publisher_text(p, c) {
    let pw = p.split(" "), cw = c.split(" ");
    if (pw.length !== cw.length || !/[a-z]/.test(c)) return false;
    return pw.every((w, i) => {
        if (key(w) !== key(cw[i])) return false;
        let a = w.normalize("NFKD").replace(/[^A-Za-z]/g, ""), b = cw[i].normalize("NFKD").replace(/[^A-Za-z]/g, "");
        if (a.toLowerCase() !== b.toLowerCase()) return true;
        return [...a].every((ch, j) => !(ch !== ch.toLowerCase() && b[j] === b[j].toLowerCase()));
    });
}

// The title, and whether the sources agree on it. PubMed's text, unless the
// publisher's is the same title word for word; spaced and typed by the NLM,
// where Crossref's can misspell ("dinucleases") or be cut short. Agreement is
// with Crossref, or with the PDB when Crossref's is cut short or wrong.
function choose_title(pdb, pm, cr) {
    let p = pm?.title?.replace(/\.$/, "") ?? null, c = cr?.title ?? null;
    if (p && c) {
        // Science's section heading: "Viral replication. Structural basis for ..."
        if (key(p).endsWith(key(c)) && key(p) !== key(c) && /^[^.:]+\.\s/.test(p)) return { title: c };
        let title = publisher_text(p, c) ? c : restore_angstrom(p, c);
        if (similar(p, c) || key(p).startsWith(key(c)) || similar(p, pdb.title)) return { title };
        return { title, problem: "PubMed's title agrees with neither Crossref's nor the PDB's" };
    }
    let t = p ?? c;
    if (!t) return { problem: "no title" };
    return similar(t, pdb.title) ? { title: t } : { title: t, problem: "title differs from the PDB's" };
}

// Close enough to be the same title: one or two characters apart in a long
// one. Used only when one source has the paper, against the PDB's title.
export function similar(a, b) {
    a = key(a); b = key(b);
    if (!a || !b) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let row = [i];
        for (let j = 1; j <= b.length; j++)
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row;
    }
    return prev[b.length] <= Math.max(2, Math.floor(0.05 * Math.max(a.length, b.length)));
}

export function build(pdb, pm, cr) {
    let t = choose_title(pdb, pm, cr);
    if (TITLES[pdb.entry_id]) t = { title: TITLES[pdb.entry_id] };
    let one = !pm || !cr;
    let first_pdb = key((pdb.authors[0] ?? "").split(",")[0]);
    let authors = choose_authors(pm, cr).map((a) => a.family ? { ...a, given: given_name(a.given) } : a);
    let first_ref = key(authors[0]?.family ?? authors[0]?.name);
    let problems = [];
    if (t.problem) problems.push(t.problem);
    if (pm && cr && pm.authors.length && cr.authors.length && key(pm.authors[0].family ?? pm.authors[0].name) !== key(cr.authors[0].family ?? cr.authors[0].name)
        && !same(surnames(pm.authors), surnames(cr.authors)))
        // PubMed's order is used; noted only when the PDB agrees with Crossref.
        if (first_pdb === key(cr.authors[0].family ?? cr.authors[0].name)) problems.push("PubMed and Crossref first authors differ");
    if (pm && !pm.complete) problems.push("PubMed's author list is incomplete");
    if (one) {
        // A single source is checked against the PDB instead.
        if (first_ref !== first_pdb) problems.push("first author differs from the PDB's");
    }
    // The issue's year, which PubMed records; Crossref's "print" date is at
    // times the online one (2DLJ: 2006, in the 2007 issue).
    let year = pm?.year ?? cr?.year ?? null;
    if (pdb.year && year && Math.abs(year - pdb.year) > 1) problems.push(`year ${year}, PDB says ${pdb.year}`);
    // PubMed's pages first: Crossref has "1-7" for Hindawi's article 721869
    // and the manuscript id ("gkv826") for Nucleic Acids Res.
    let cr_pages = cr?.pages?.first && !/^gk[a-z]\d+$/i.test(cr.pages.first) ? cr.pages : null;
    let pages = pm?.pages?.first ? pm.pages
        : cr_pages ? cr_pages
        : pdb.page_first ? { first: pdb.page_first, last: pdb.page_last }
        : { first: cr?.article_number ?? null, last: null };
    let record = {
        from: [pm && "pubmed", cr && "crossref"].filter(Boolean),
        type: cr?.type ?? "article",
        title: t.title ?? null,
        authors,
        journal: cr?.journal ?? pm?.journal ?? pdb.journal_abbrev,
        journal_abbrev: cr?.type === "preprint" ? cr.journal : pm?.journal_abbrev ?? cr?.journal_abbrev ?? pdb.journal_abbrev,
        volume: cr?.volume ?? pm?.volume ?? pdb.journal_volume,
        issue: cr?.issue ?? pm?.issue ?? null,
        page_first: pages.first ?? null,
        page_last: pages.last ?? null,
        year: year ?? pdb.year,
        issn: cr?.issn ?? pm?.issn ?? pdb.journal_id_issn,
        book_title: cr?.book_title ?? null,
        isbn: cr?.isbn ?? null,
        // As deposited: Crossref gives DOIs in lower case.
        doi: pdb.doi ?? pm?.doi ?? cr?.doi,
        pubmed: pm?.pmid ?? null,
        publisher: cr?.publisher ?? null,
        abstract: pm?.abstract ?? null,
        keywords: pm?.keywords?.length ? pm.keywords : null
    };
    return { record, problems };
}

// ── one name per journal ────────────────────────────────────────────────────
// PubMed's journal name is the NLM catalogue's, in sentence case and with a
// place: "Nucleic acids research", "Science (New York, N.Y.)". Crossref has
// two Nature Structural Biology papers (1ZHU 1995, 1Q2R 2003) under the name
// and ISSN the journal took in 2004. So each paper takes the name and ISSN
// most of its journal's papers have at Crossref, the journal being the NLM
// abbreviation, which the NLM changes when a journal is renamed. A name
// has to be at least two thirds of its journal's to count. A Crossref
// name is changed only along with its ISSN.
//
// Journals with no paper of ours at Crossref, and EMBO Rep (one paper each
// way), by the name Crossref's register gives their ISSN:
// https://api.crossref.org/journals/{issn}
export const JOURNALS = {
    "J Biomol Struct Dyn": "Journal of Biomolecular Structure and Dynamics",   // 0739-1102
    "J Biochem": "The Journal of Biochemistry",                                // 0021-924X
    "Cell Cycle": "Cell Cycle",                                                // 1551-4005
    "EMBO Rep": "EMBO Reports"                                                 // 1469-221X
};

export function name_journals(records) {
    let names = {}, issns = {};
    let count = (map, k, v) => { if (!v) return; map[k] ??= {}; map[k][v] = (map[k][v] ?? 0) + 1; };
    for (const r of records) if (r.from.includes("crossref") && r.type === "article") {
        count(names, r.journal_abbrev, r.journal);
        count(issns, r.journal_abbrev, r.issn);
    }
    let top = (map) => {
        let all = Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]);
        let total = all.reduce((n, [, c]) => n + c, 0);
        return all.length && all[0][1] * 3 >= total * 2 ? all[0][0] : null;
    };
    for (const r of records) {
        if (r.type !== "article") continue;
        let name = JOURNALS[r.journal_abbrev] ?? top(names[r.journal_abbrev]);
        if (!name || name === r.journal) continue;
        let issn = top(issns[r.journal_abbrev]);
        // The publisher's own name stands ("PLOS ONE" since 2012, "PLoS ONE"
        // before) unless its ISSN is not its journal's either: the renamed
        // journal's, which then goes too.
        if (r.from.includes("crossref") && !JOURNALS[r.journal_abbrev]) {
            if (!issn || r.issn === issn) continue;
            r.issn = issn;
        }
        r.journal = name;
    }
}

// ── run ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let { query, close } = await import("../db.js");
    let rows = (await query(`
        SELECT c.entry_id, c.title, c.journal_abbrev, c.journal_volume, c.page_first, c.page_last,
               c.year, c.journal_id_issn, c.pdbx_database_id_doi AS doi, c.pdbx_database_id_pubmed AS pmid,
               COALESCE((SELECT json_agg(a.name ORDER BY a.ordinal) FROM citation_author a
                         WHERE a.entry_id = c.entry_id AND a.citation_id = 'primary'), '[]') AS authors
        FROM citation c WHERE c.id = 'primary' ORDER BY c.entry_id`)).rows;
    await close();

    let entries = {}, held = [], counts = { pubmed_and_crossref: 0, pubmed: 0, crossref: 0, pdb: 0, held: 0 };
    let newer = [];
    for (let r of rows) {
        // No DOI or PMID in our copy: the RCSB's current citation, if the
        // paper has come out since, stands in for ours (and is checked the same way).
        let rcsb_file = join(CACHE, "rcsb", `${r.entry_id}.json`);
        if (!r.doi && !(r.pmid > 0) && existsSync(rcsb_file)) {
            let c = JSON.parse(readFileSync(rcsb_file, "utf8"));
            if (c.pdbx_database_id_DOI || c.pdbx_database_id_PubMed > 0) {
                r = { entry_id: r.entry_id, title: c.title, journal_abbrev: c.rcsb_journal_abbrev ?? c.journal_abbrev,
                      journal_volume: c.journal_volume ?? null, page_first: c.page_first ?? null, page_last: c.page_last ?? null,
                      year: c.year ?? null, journal_id_issn: c.journal_id_ISSN ?? null,
                      doi: c.pdbx_database_id_DOI ?? null, pmid: c.pdbx_database_id_PubMed ?? null, authors: c.rcsb_authors ?? [] };
                newer.push(r.entry_id);
            }
        }
        let match = MATCHES[r.entry_id] && !r.doi && !(r.pmid > 0)
            && JSON.parse(readFileSync(join(CACHE, "search", `${r.entry_id}.json`), "utf8")).find((m) => m.DOI === MATCHES[r.entry_id]);
        if (match) r = { ...r, doi: match.DOI, pmid: match.pmid ? Number(match.pmid) : null, matched: true };
        let linked = PUBMED_MATCHES[r.entry_id];
        if (linked && !r.doi && !(r.pmid > 0)) r = { ...r, doi: linked.doi, pmid: linked.pmid, matched: true };
        let cr_file = r.doi && join(CACHE, "crossref", `${encodeURIComponent(r.doi.toLowerCase())}.json`);
        let cr_json = cr_file && existsSync(cr_file) ? JSON.parse(readFileSync(cr_file, "utf8")) : null;
        let cr = cr_json?.message ? read_crossref(cr_json.message) : null;
        let pm_file = r.pmid > 0 && join(CACHE, "pubmed", `${r.pmid}.xml`);
        let pm = pm_file && existsSync(pm_file) ? read_pubmed(readFileSync(pm_file, "utf8")) : null;
        if (!pm && !cr) { counts.pdb++; continue; }
        let { record, problems } = build(r, pm, cr);
        if (problems.length && !REVIEWED[r.entry_id]) {
            held.push({ id: r.entry_id, problems, pdb: r.title, pubmed: pm?.title ?? null, crossref: cr?.title ?? null,
                        pdb_authors: r.authors.slice(0, 3), pubmed_authors: pm?.authors.slice(0, 3).map((a) => a.family ?? a.name) ?? null,
                        crossref_authors: cr?.authors.slice(0, 3).map((a) => a.family ?? a.name) ?? null });
            counts.held++;
            continue;
        }
        entries[r.entry_id] = record;
        counts[pm && cr ? "pubmed_and_crossref" : pm ? "pubmed" : "crossref"]++;
    }
    name_journals(Object.values(entries));
    writeFileSync(OUT, JSON.stringify({ sources: ["https://api.crossref.org/", "https://pubmed.ncbi.nlm.nih.gov/"],
                                        built: new Date().toISOString().slice(0, 10), entries }) + "\n");
    writeFileSync(join(CACHE, "held.json"), JSON.stringify(held, null, 1));
    console.log(counts);
    console.log(`published since our copy (RCSB): ${newer.length}`, newer.join(" "));
    for (const h of held) console.log(h.id, "·", h.problems.join("; "));
}
