// Caches each entry's paper from RCSB, Crossref and PubMed in db/citation_cache/. Run: node --env-file=.env db/fetch_citations.mjs

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

const doi_file = (doi) => join(fileURLToPath(CACHE), "crossref", `${encodeURIComponent(doi.toLowerCase())}.json`);

async function get(url, tries = 5) {
    for (let n = 1; ; n++) {
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

// Title-search matches are used only once listed in build_citations.mjs MATCHES.
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
    for (const m of found) {
        if (!existsSync(doi_file(m.DOI))) writeFileSync(doi_file(m.DOI), JSON.stringify({ message: m }));
        if (m.pmid) rows.push({ entry_id: r.entry_id, doi: m.DOI, pmid: Number(m.pmid) });
    }
}
console.log(`search: ${searched} searched now, ${candidates} candidates`);

for (const [entry_id, m] of Object.entries(PUBMED_MATCHES)) rows.push({ entry_id, doi: m.doi, pmid: m.pmid });

// A 404 is kept: a DOI Crossref does not know is an answer.
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
