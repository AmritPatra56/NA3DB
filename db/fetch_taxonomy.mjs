// fetch_taxonomy.mjs - the other names of every organism the database holds.
//
//   node --env-file=.env db/fetch_taxonomy.mjs
//
// Writes taxonomy.json: for each NCBI taxonomy id in a source or host column,
// its scientific name, its common names and synonyms, and its lineage. This
// is what lets "mouse" find Mus musculus, and "Escherichia coli" find a host
// recorded as the strain "Escherichiacoli 'BL21-Gold(DE3)pLysS AG'".
// RCSB and PDBe index the same NCBI names for the same reason.
//
// Reads the database, never writes it. Run again after a load brings new taxa.
// Source: NCBI E-utilities efetch, db=taxonomy
// https://www.ncbi.nlm.nih.gov/books/NBK25499/#chapter4.EFetch

import { writeFileSync } from "node:fs";
import { query, close } from "../db.js";

const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const BATCH = 200;
// Without an API key NCBI allows three requests a second.
const PAUSE_MS = 400;
const OUT = new URL("../taxonomy.json", import.meta.url);

const TAXIDS = `
    SELECT DISTINCT t FROM (
        SELECT pdbx_host_org_ncbi_taxonomy_id AS t FROM entity_src_gen
        UNION SELECT pdbx_gene_src_ncbi_taxonomy_id FROM entity_src_gen
        UNION SELECT pdbx_ncbi_taxonomy_id FROM entity_src_nat
        UNION SELECT ncbi_taxonomy_id FROM pdbx_entity_src_syn) x
     WHERE t IS NOT NULL ORDER BY t`;

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
                       .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const all = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => decode(m[1]));
const one = (xml, tag) => all(xml, tag)[0];

// One <Taxon> record. Its lineage is cut out first, because the lineage holds
// <Taxon> records of its own whose names must not be read as this one's.
function parse(record) {
    let lineage_xml = record.match(/<LineageEx>([\s\S]*?)<\/LineageEx>/)?.[1] ?? "";
    let own = record.replace(/<LineageEx>[\s\S]*?<\/LineageEx>/, "");
    let other = own.match(/<OtherNames>([\s\S]*?)<\/OtherNames>/)?.[1] ?? "";

    return {
        taxid: Number(one(own, "TaxId")),
        aka: all(own.match(/<AkaTaxIds>([\s\S]*?)<\/AkaTaxIds>/)?.[1] ?? "", "TaxId").map(Number),
        name: one(own, "ScientificName"),
        common: [...new Set([...all(other, "GenbankCommonName"), ...all(other, "CommonName")])],
        synonyms: [...new Set([...all(other, "Synonym"), ...all(other, "EquivalentName")])],
        acronyms: [...new Set([...all(other, "GenbankAcronym"), ...all(other, "Acronym")])],
        lineage: [...lineage_xml.matchAll(/<Taxon>([\s\S]*?)<\/Taxon>/g)]
            .map((m) => one(m[1], "ScientificName"))
    };
}

async function fetch_batch(ids) {
    let url = `${EFETCH}?db=taxonomy&retmode=xml&tool=na3db&id=${ids.join(",")}`;
    let res = await fetch(url);
    if (!res.ok) throw new Error(`NCBI answered ${res.status} for ${ids.length} ids`);
    let xml = await res.text();
    // Top-level records only: lineages are cut out before splitting.
    let flat = xml.replace(/<LineageEx>[\s\S]*?<\/LineageEx>/g, (m) => m.replaceAll("Taxon>", "LTaxon>"));
    return [...flat.matchAll(/<Taxon>([\s\S]*?)<\/Taxon>/g)]
        .map((m) => parse(m[1].replaceAll("LTaxon>", "Taxon>")));
}

let ids = (await query(TAXIDS)).rows.map((r) => Number(r.t));
await close();

let taxa = {};
for (let i = 0; i < ids.length; i += BATCH) {
    let batch = ids.slice(i, i + BATCH);
    for (const t of await fetch_batch(batch)) {
        // A merged id comes back under its new number; file it under the
        // number our data uses, which is the one a query will look up.
        let ours = [t.taxid, ...t.aka].filter((id) => batch.includes(id));
        let { aka, ...kept } = t;
        for (const id of ours) taxa[id] = { ...kept, taxid: id, current: t.taxid };
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
}

let missing = ids.filter((id) => !taxa[id]);
if (missing.length) {
    console.error(`NCBI returned nothing for ${missing.length} ids: ${missing.join(", ")}`);
    process.exitCode = 1;
}

writeFileSync(OUT, JSON.stringify({ source: EFETCH, fetched: new Date().toISOString().slice(0, 10),
                                    taxa }, null, 1) + "\n");
console.log(`${Object.keys(taxa).length} of ${ids.length} taxa written to taxonomy.json`);
