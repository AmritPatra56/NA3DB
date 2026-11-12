// fetch_citations.mjs - each entry's primary paper as the publisher and
// PubMed record it, to fill what the PDB leaves out.
//
//   node --env-file=.env db/fetch_citations.mjs
//
// The PDB keeps initials, an abbreviated journal and no issue, ISSN or
// abstract. Crossref has the publisher's record of a DOI; PubMed adds the
// abstract and keywords, and is the source for papers with a PMID but no DOI.
//
//   RCSB      https://data.rcsb.org/redoc/index.html          (GET /rest/v1/core/entry/{id})
//   Crossref  https://api.crossref.org/swagger-ui/index.html  (GET /works/{doi})
//   PubMed    https://www.ncbi.nlm.nih.gov/books/NBK25499/    (EFetch, XML)
//
// The RCSB is asked first about entries whose paper had no DOI or PMID when
// our files were made: the PDB adds the citation once the paper is out.
//
// Responses are kept in db/citation_cache/ (git-ignored), so a second run
// fetches only what is new. Both services ask for gentle use: Crossref's
// public pool and NCBI's 3 requests a second without a key.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { query, close } from "../db.js";
import { key, similar, PUBMED_MATCHES } from "./build_citations.mjs";

const CACHE = new URL("./citation_cache/", import.meta.url);
const HEADERS = { "User-Agent": "na3db" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(new URL("crossref/", CACHE), { recursive: true });
mkdirSync(new URL("pubmed/", CACHE), { recursive: true });
mkdirSync(new URL("rcsb/", CACHE), { recursive: true });
mkdirSync(new URL("search/", CACHE), { recursive: true });

// A DOI as a file name: "/" and other path characters encoded.
const doi_file = (doi) => join(fileURLToPath(CACHE), "crossref", `${encodeURIComponent(doi.toLowerCase())}.json`);

async function get(url, tries = 5) {
    for (let n = 1; ; n++) {
        // A dropped connection is retried like a busy server.
        let res = await fetch(url, { headers: HEADERS }).catch((e) => ({ status: e.cause?.code ?? e.message }));
        if (res.ok || res.status === 404) return res;
        if (n === tries) throw new Error(`${res.status} from ${url}`);
        await pause(2000 * n);
    }
}

let rows = (await query(`
    SELECT c.entry_id, c.title, c.pdbx_database_id_doi AS doi, c.pdbx_database_id_pubmed AS pmid,
           (SELECT a.name FROM citation_author a WHERE a.entry_id = c.entry_id
            AND a.citation_id = 'primary' ORDER BY a.ordinal LIMIT 1) AS first_author
    FROM citation c WHERE c.id = 'primary' ORDER BY c.entry_id`)).rows;
await close();

// The RCSB's current primary citation for entries we have no DOI or PMID for.
let rcsb_fetched = 0;
for (const r of rows.filter((r) => !r.doi && !(r.pmid > 0))) {
    let file = new URL(`rcsb/${r.entry_id}.json`, CACHE);
    if (!existsSync(file)) {
        let res = await get(`https://data.rcsb.org/rest/v1/core/entry/${r.entry_id}`);
        writeFileSync(file, JSON.stringify(res.status === 404 ? { status: 404 } : (await res.json()).rcsb_primary_citation ?? {}));
        rcsb_fetched++;
        await pause(150);
    }
    let c = JSON.parse(readFileSync(file, "utf8"));
    r.doi = c.pdbx_database_id_DOI ?? null;
    r.pmid = c.pdbx_database_id_PubMed ?? null;
}
console.log(`rcsb: ${rcsb_fetched} fetched now`);

// Still no DOI or PMID: Crossref searched by the title and first author.
// Kept are only papers with the same title (a character or two apart) and
// the same first author; build_citations.mjs uses one only once it is listed
// in its MATCHES, after a person has looked. Their PMIDs are looked up by DOI.
// Papers only: Crossref also has every PDB entry under its own DOI (10.2210),
// with the entry's title and depositors, which would match every search.
const PAPER = new Set(["journal-article", "posted-content", "book-chapter", "proceedings-article"]);
const paper = (m) => PAPER.has(m.type) && !m.DOI.startsWith("10.2210/");
let searched = 0, candidates = 0;
for (const r of rows.filter((r) => !r.doi && !(r.pmid > 0) && r.title)) {
    let file = new URL(`search/${r.entry_id}.json`, CACHE);
    if (!existsSync(file)) {
        let surname = (r.first_author ?? "").split(",")[0];
        let res = await get(`https://api.crossref.org/works?rows=10&filter=${[...PAPER].map((t) => `type:${t}`).join(",")}` +
                            `&query.bibliographic=${encodeURIComponent(r.title)}` +
                            (surname ? `&query.author=${encodeURIComponent(surname)}` : ""));
        let items = (await res.json()).message?.items ?? [];
        let found = items.filter((m) => paper(m) && similar(m.title?.[0] ?? "", r.title) &&
            key(m.author?.[0]?.family ?? m.author?.[0]?.name) === key(surname));
        for (const m of found) {
            let ids = await (await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&tool=na3db&term=${encodeURIComponent(m.DOI)}[doi]`)).json();
            m.pmid = ids.esearchresult?.idlist?.length === 1 ? ids.esearchresult.idlist[0] : null;
            await pause(400);
        }
        writeFileSync(file, JSON.stringify(found));
        searched++;
        await pause(300);
    }
    let found = JSON.parse(readFileSync(file, "utf8")).filter(paper);
    candidates += found.length;
    // Fetched below like any other paper, so the build has both records.
    for (const m of found) {
        if (!existsSync(doi_file(m.DOI))) writeFileSync(doi_file(m.DOI), JSON.stringify({ message: m }));
        if (m.pmid) rows.push({ entry_id: r.entry_id, doi: m.DOI, pmid: Number(m.pmid) });
    }
}
console.log(`search: ${searched} searched now, ${candidates} candidates`);

// Papers PubMed links to the entry, confirmed by a person.
for (const [entry_id, m] of Object.entries(PUBMED_MATCHES)) rows.push({ entry_id, doi: m.doi, pmid: m.pmid });

// Crossref, one DOI at a time. 404 is kept too: a DOI Crossref does not know
// (DataCite and a few others) is an answer, not a failure.
let dois = [...new Set(rows.map((r) => r.doi).filter(Boolean))];
let fetched = 0, missing = 0;
for (const doi of dois) {
    if (existsSync(doi_file(doi))) continue;
    let res = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    let body = res.status === 404 ? { status: 404 } : await res.json();
    if (res.status === 404) missing++;
    writeFileSync(doi_file(doi), JSON.stringify(body));
    fetched++;
    if (fetched % 100 === 0) console.log(`crossref ${fetched}`);
    await pause(250);
}
console.log(`crossref: ${dois.length} DOIs, ${fetched} fetched now, ${missing} unknown to Crossref`);

// PubMed, 200 PMIDs a request, one XML file a PMID.
let pmids = [...new Set(rows.map((r) => r.pmid).filter(Boolean).map(String))]
    .filter((p) => !existsSync(new URL(`pubmed/${p}.xml`, CACHE)));
for (let i = 0; i < pmids.length; i += 200) {
    let batch = pmids.slice(i, i + 200);
    let res = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&tool=na3db&id=${batch.join(",")}`);
    let xml = await res.text();
    let articles = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];
    for (const a of articles) {
        let pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)[1];
        writeFileSync(new URL(`pubmed/${pmid}.xml`, CACHE), a);
    }
    console.log(`pubmed ${i + batch.length}/${pmids.length}: ${articles.length} records`);
    await pause(400);
}
