// fetch_nakb.mjs - which entries NAKB labels as each molecule on the front page.
//
//   node db/fetch_nakb.mjs
//
// Writes nakb.json: for each molecule in nakb.js NAKB_TOPICS, the PDB ids
// NAKB gives that label. NAKB's labels are assigned from sequence clusters
// and DSSR geometry, then reviewed by its curators (Lawson et al. 2024,
// Nucleic Acids Research 52, D245-D254, doi:10.1093/nar/gkad957). Only the
// molecules whose labels agreed with an independent method on our entries
// are used: Rfam, Pfam histones or DSSR G4DB.
//
// NAKB updates weekly. Run again after a load brings new entries; an entry
// NAKB has not labelled yet is in no molecule until then.
// Source: https://www.nakb.org/download.html ("NAKB annotations")

import { writeFileSync } from "node:fs";
import { NAKB_TOPICS } from "../nakb.js";

const URL_ALL = "https://www.nakb.org/node/solr/nakb/select?fl=id,pdbid,NAKBnaList,NAKBprotList" +
                "&q=NAKBna:*%20OR%20NAKBprot:*&wt=json&rows=200000";
const OUT = new URL("../nakb.json", import.meta.url);

let res = await fetch(URL_ALL, { headers: { "User-Agent": "na3db" } });
if (!res.ok) throw new Error(`NAKB answered ${res.status}`);
let docs = (await res.json()).response.docs;
// Fewer than this is a broken download, not NAKB shrinking.
if (docs.length < 20000) throw new Error(`only ${docs.length} entries came back`);

let topics = {};
for (const t of NAKB_TOPICS) {
    let list = t.nakb.list === "na" ? "NAKBnaList" : "NAKBprotList";
    topics[t.value] = docs.filter((d) => d.pdbid && (d[list] ?? []).includes(t.nakb.term))
                          .map((d) => d.pdbid.toUpperCase())
                          .sort();
    if (topics[t.value].length === 0) throw new Error(`no entry is labelled "${t.nakb.term}"`);
}

writeFileSync(OUT, JSON.stringify({ source: "https://www.nakb.org/download.html",
                                    fetched: new Date().toISOString().slice(0, 10),
                                    topics }, null, 1) + "\n");
for (const [k, ids] of Object.entries(topics)) console.log(k.padEnd(12), ids.length);
