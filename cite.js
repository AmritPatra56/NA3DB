// cite.js - an entry's primary citation as a reference to save or paste.
//
// From the checked reference in citations.json (db/build_citations.mjs: the
// publisher's record at Crossref and the NLM's at PubMed, which check each
// other) or, for an entry with neither, the citation the depositors gave the
// PDB. search.js entry_citation gives both the same shape.
//
//   RIS     EndNote, Zotero, Mendeley.   https://en.wikipedia.org/wiki/RIS_(file_format)
//   BibTeX  LaTeX.                       https://www.bibtex.org/Format/
//
// RIS tags are the ones Zotero's importer maps for each type
// (https://github.com/zotero/translators/blob/master/RIS.js, fieldMap): T2 is
// the journal of an article and the book of a chapter, J2 the journal's
// abbreviation, T3 a chapter's series.
//
// Entries the PDB lists as "To be published" are saved as unpublished work
// with that note and a link to the entry's own PDB DOI, never with a year or
// journal made up.

// A few PDB titles carry HTML codes from deposition, "G&#8226;U" for G•U, and
// one a byte-order mark. Decoded so the page and the files show the symbol.
export function clean_title(title) {
    if (!title) return title;
    return title
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/﻿/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export const unpublished = (c) => c.source === "pdb" && /^\s*to be published\s*$/i.test(c.journal ?? "");

// Every PDB entry has a DOI of this form, registered by the wwPDB.
// https://www.wwpdb.org/documentation/policy (citing the PDB)
export const pdb_doi = (id) => `10.2210/pdb${id.toLowerCase()}/pdb`;

// A PDB author, "Yu,H.", as the reference's { family, given }; a consortium
// name, with no comma, stays whole.
export function pdb_author(name) {
    let m = name.match(/^([^,]+),\s*(.*)$/);
    return m ? { family: m[1].trim(), given: m[2].trim() || null } : { name: name.trim() };
}

// "Mark A." as "M.A.", "Jian-Wen" as "J.-W.". Initials already, as the PDB
// gives them ("B.E.", "M.-C."), stay as they are.
export const initials = (given) => given.split(/\s+/).filter(Boolean)
    .map((part) => part.includes(".") ? part : part.split("-").map((p) => p ? p[0] + "." : "").join("-")).join("");

// "Nissen, P." for a reference list.
export const short_name = (a) => a.family ? [a.family, a.given && initials(a.given)].filter(Boolean).join(", ") : a.name;
// "Poul Nissen" for the page.
export const full_name = (a) => a.family ? [a.given, a.family, a.suffix].filter(Boolean).join(" ") : a.name;

// A reference style adds its own full stop after the title. Some end in
// " ." ("Escherichia coli ."), so the space goes too.
const bare = (title) => title?.replace(/\s*\.\s*$/, "").trim() ?? null;

const page_range = (c) => c.page_last ? `${c.page_first}-${c.page_last}` : c.page_first ?? null;

// "Structure 7(2), 143-156", "Nucleic Acids Res 53, gkaf604".
function source_line(c, journal) {
    let vol = c.volume ? c.volume + (c.issue ? `(${c.issue})` : "") : null;
    return [journal, [vol, page_range(c)].filter(Boolean).join(", ")].filter(Boolean).join(" ") || null;
}

// One line for a paper's reference list or the clipboard.
export function citation_text(id, c) {
    let head = [c.authors.map(short_name).join(", "), c.title].filter(Boolean).map((s) => bare(s) + ".").join(" ");
    if (unpublished(c)) return `${head} To be published. PDB entry ${id}, doi:${pdb_doi(id)}`;
    let journal = c.journal_abbrev ?? c.journal;
    let where = c.type === "chapter"
        ? [c.book_title && `In: ${c.book_title}.`, source_line(c, journal)].filter(Boolean).join(" ")
        : c.type === "preprint" ? `${c.journal} preprint` : source_line(c, journal);
    let source = [where, c.year ? `(${c.year})` : null].filter(Boolean).join(" ");
    return [head, source ? source + "." : null, c.doi ? `doi:${c.doi}` : null].filter(Boolean).join(" ");
}

// The structure's own DOI, in every file: the paper is cited for the structure.
const structure_note = (id, c) =>
    [unpublished(c) && "To be published.", c.type === "preprint" && "Preprint.",
     `Structure: PDB entry ${id}, doi:${pdb_doi(id)}`].filter(Boolean).join(" ");

// RIS: one tag per line, "TY  - " first and "ER  - " last.
export function citation_ris(id, c) {
    let line = (tag, value) => value === null || value === undefined || value === ""
        ? [] : [`${tag}  - ${String(value).replace(/\s+/g, " ").trim()}`];
    let ris_name = (a) => a.family ? [a.family, a.given, a.suffix].filter(Boolean).join(", ") : a.name;
    let chapter = c.type === "chapter";
    let body = [
        ...line("TY", unpublished(c) ? "UNPB" : chapter ? "CHAP" : "JOUR"),
        ...line("TI", bare(c.title)),
        ...c.authors.flatMap((a) => line("AU", ris_name(a))),
        ...(unpublished(c) ? [] : [
            ...line("T2", chapter ? c.book_title : c.journal),
            ...line(chapter ? "T3" : "J2", chapter ? c.journal : c.journal_abbrev),
            ...line("VL", c.volume), ...line("IS", c.issue),
            ...line("SP", c.page_first), ...line("EP", c.page_last),
            ...line("PY", c.year),
            ...line("SN", chapter ? c.isbn : c.issn),
            ...line("PB", chapter ? c.publisher : null),
            ...line("DO", c.doi),
            ...line("AN", c.pubmed ? `PMID:${c.pubmed}` : null)]),
        ...line("UR", c.doi ? `https://doi.org/${c.doi}` : unpublished(c) ? `https://doi.org/${pdb_doi(id)}` : null),
        ...line("AB", c.abstract),
        ...(c.keywords ?? []).flatMap((k) => line("KW", k)),
        ...line("N1", structure_note(id, c))
    ];
    return [...body, "ER  - ", ""].join("\r\n");
}

// BibTeX: braces and LaTeX's special characters escaped in every value.
const tex = (s) => String(s).replace(/[\\{}&%$#_~^]/g, (ch) =>
    ({ "\\": "\\textbackslash{}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" })[ch] ?? "\\" + ch);

export function citation_bibtex(id, c) {
    // "Last, Jr, First" is BibTeX's order. Initials spaced, "Y. L.": BibTeX
    // reads "Y.L." as one name and would shorten it to "Y.". A name without a
    // family name is an organisation: braced, or BibTeX would read its last
    // word as a surname.
    let bib_name = (a) => a.family
        ? tex([a.family, a.suffix, a.given?.replace(/\.(?=\p{Lu})/gu, ". ")].filter(Boolean).join(", "))
        : `{${tex(a.name)}}`;
    let authors = c.authors.map(bib_name).join(" and ");
    let pages = c.page_last ? `${c.page_first}--${c.page_last}` : c.page_first;
    let kind = unpublished(c) ? "unpublished" : c.type === "chapter" ? "incollection" : "article";
    let fields = unpublished(c)
        ? [["author", authors], ["title", bare(c.title)], ["note", structure_note(id, c)]]
        : [["author", authors], ["title", bare(c.title)],
           ...(kind === "incollection"
               ? [["booktitle", c.book_title], ["series", c.journal], ["publisher", c.publisher], ["isbn", c.isbn]]
               : [["journal", c.journal], ["issn", c.issn]]),
           ["volume", c.volume], ["number", c.issue], ["pages", pages], ["year", c.year],
           ["doi", c.doi], ["url", c.doi ? `https://doi.org/${c.doi}` : null], ["pmid", c.pubmed],
           ["abstract", c.abstract], ["keywords", c.keywords?.join(", ")],
           ["note", structure_note(id, c)]];
    // author is escaped above. The title is double-braced so BibTeX styles
    // keep its capitals: "DNA" must not become "dna". A DOI and its URL stay
    // as they are: styles print them verbatim, so "0_8" escaped would break the link.
    let value = (k, v) => k === "author" || k === "doi" || k === "url" ? v : k === "title" ? `{${tex(v)}}` : tex(v);
    let lines = fields.filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `  ${k.padEnd(9)} = {${value(k, v)}}`);
    return `@${kind}{PDB${id},\n${lines.join(",\n")}\n}\n`;
}
