// Some PDB titles carry HTML entities (G&#8226;U) and one a byte-order mark.
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

export const pdb_doi = (id) => `10.2210/pdb${id.toLowerCase()}/pdb`;

export function pdb_author(name) {
    let m = name.match(/^([^,]+),\s*(.*)$/);
    return m ? { family: m[1].trim(), given: m[2].trim() || null } : { name: name.trim() };
}

export const initials = (given) => given.split(/\s+/).filter(Boolean)
    .map((part) => part.includes(".") ? part : part.split("-").map((p) => p ? p[0] + "." : "").join("-")).join("");

export const short_name = (a) => a.family ? [a.family, a.given && initials(a.given)].filter(Boolean).join(", ") : a.name;
export const full_name = (a) => a.family ? [a.given, a.family, a.suffix].filter(Boolean).join(" ") : a.name;

// Some titles end in " .", which doubles the style's own full stop.
const bare = (title) => title?.replace(/\s*\.\s*$/, "").trim() ?? null;

const page_range = (c) => c.page_last ? `${c.page_first}-${c.page_last}` : c.page_first ?? null;

function source_line(c, journal) {
    let vol = c.volume ? c.volume + (c.issue ? `(${c.issue})` : "") : null;
    return [journal, [vol, page_range(c)].filter(Boolean).join(", ")].filter(Boolean).join(" ") || null;
}

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

const structure_note = (id, c) =>
    [unpublished(c) && "To be published.", c.type === "preprint" && "Preprint.",
     `Structure: PDB entry ${id}, doi:${pdb_doi(id)}`].filter(Boolean).join(" ");

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

const tex = (s) => String(s).replace(/[\\{}&%$#_~^]/g, (ch) =>
    ({ "\\": "\\textbackslash{}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" })[ch] ?? "\\" + ch);

export function citation_bibtex(id, c) {
    // Initials spaced ("Y. L."): BibTeX reads "Y.L." as one name. No family name means an organisation, so it is braced.
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
    // Double braces keep the title's capitals; DOI and URL are printed verbatim, so not escaped.
    let value = (k, v) => k === "author" || k === "doi" || k === "url" ? v : k === "title" ? `{${tex(v)}}` : tex(v);
    let lines = fields.filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `  ${k.padEnd(9)} = {${value(k, v)}}`);
    return `@${kind}{PDB${id},\n${lines.join(",\n")}\n}\n`;
}
