// cite.test.js - the primary citation as text, RIS and BibTeX.
import test from "node:test";
import assert from "node:assert";
import { citation_text, citation_ris, citation_bibtex, clean_title, pdb_doi, unpublished,
         pdb_author, initials, short_name, full_name } from "./cite.js";

// 7CCD from citations.json, trimmed to three authors and a short abstract.
const PAPER = {
    source: "reference", type: "article",
    title: "DNA backbone interactions impact sulfur-binding domains.",
    authors: [{ family: "Yu", given: "Hao" }, { family: "Zhao", given: "Yong Liang" }, { family: "Koag", given: "Myong-Chul" }],
    journal: "Nucleic Acids Research", journal_abbrev: "Nucleic Acids Res", volume: "48", issue: "15",
    page_first: "8755", page_last: "8766", year: 2020, issn: "0305-1048",
    doi: "10.1093/nar/gkaa574", pubmed: "32621606", abstract: "Sulfur binds.", keywords: null
};
// As search.js gives an entry the PDB has as "To be published".
const UNPUBLISHED = {
    source: "pdb", type: "article",
    title: "Structure of Dpo4 across N7-methylguanine",
    authors: ["Koag, M.-C.", "Midwest Center for Structural Genomics (MCSG)"].map(pdb_author),
    journal: "To Be Published", journal_abbrev: "To Be Published", volume: null, issue: null,
    page_first: null, page_last: null, year: null, doi: null, pubmed: null, abstract: null, keywords: null
};
const PREPRINT = { ...PAPER, type: "preprint", journal: "bioRxiv", journal_abbrev: "bioRxiv",
                   volume: null, issue: null, page_first: null, page_last: null, issn: null, pubmed: null,
                   doi: "10.1101/2024.01.01.123456", year: 2024 };
const CHAPTER = { ...PAPER, type: "chapter", journal: "Methods in Molecular Biology", journal_abbrev: null,
                  book_title: "CRISPR", isbn: "9781493927623", publisher: "Springer New York",
                  volume: "1311", issue: null, page_first: "101", page_last: "120", issn: null, pubmed: null };

test("the PDB DOI is the entry's, in lower case", () => {
    assert.equal(pdb_doi("5EDW"), "10.2210/pdb5edw/pdb");
});

test("To be published is recognised in any case, only in the PDB's record", () => {
    for (const j of ["To Be Published", "to be published", " To be Published "]) assert.ok(unpublished({ source: "pdb", journal: j }));
    for (const j of ["Nature", null, "To Be Published Soon"]) assert.ok(!unpublished({ source: "pdb", journal: j }));
    assert.ok(!unpublished({ source: "reference", journal: "To Be Published" }));
});

test("HTML codes and a byte-order mark leave a title", () => {
    assert.equal(clean_title("&#65279;G&#8226;U and ORC&#xB7;DNA"), "G•U and ORC·DNA");
    assert.equal(clean_title(null), null);
});

test("a PDB author splits at the comma; a consortium stays whole", () => {
    assert.deepEqual(pdb_author("Yu,H."), { family: "Yu", given: "H." });
    assert.deepEqual(pdb_author("Koag, M.-C."), { family: "Koag", given: "M.-C." });
    assert.deepEqual(pdb_author("MCSG"), { name: "MCSG" });
});

test("initials from full names; the PDB's initials as they are", () => {
    assert.deepEqual(["Mark A.", "Jian-Wen", "Søren", "B.E.", "M.-C.", "Y. L."].map(initials),
                     ["M.A.", "J.-W.", "S.", "B.E.", "M.-C.", "Y.L."]);
});

test("short and full names", () => {
    assert.equal(short_name({ family: "Zhao", given: "Yong Liang" }), "Zhao, Y.L.");
    assert.equal(short_name({ family: "Zhao", given: null }), "Zhao");
    assert.equal(full_name({ family: "King", given: "Martin Luther", suffix: "Jr" }), "Martin Luther King Jr");
    assert.equal(short_name({ name: "MCSG" }), "MCSG");
    assert.equal(full_name({ name: "MCSG" }), "MCSG");
});

test("a paper as one line of text", () => {
    assert.equal(citation_text("7CCD", PAPER),
        "Yu, H., Zhao, Y.L., Koag, M.-C. DNA backbone interactions impact sulfur-binding domains. "
      + "Nucleic Acids Res 48(15), 8755-8766 (2020). doi:10.1093/nar/gkaa574");
});

test("a paper with no year or journal leaves them out, with no stray full stop", () => {
    let text = citation_text("4TNA", { ...PAPER, journal: null, journal_abbrev: null, volume: null, page_first: null,
                                       page_last: null, year: null, doi: null });
    assert.equal(text, "Yu, H., Zhao, Y.L., Koag, M.-C. DNA backbone interactions impact sulfur-binding domains.");
});

test("an unpublished entry as text names the PDB entry and its DOI, and no year", () => {
    assert.equal(citation_text("5EDW", UNPUBLISHED),
        "Koag, M.-C., Midwest Center for Structural Genomics (MCSG). Structure of Dpo4 across N7-methylguanine. "
      + "To be published. PDB entry 5EDW, doi:10.2210/pdb5edw/pdb");
});

test("a preprint and a chapter as text", () => {
    assert.match(citation_text("X", PREPRINT), / bioRxiv preprint \(2024\)\. doi:10\.1101\/2024\.01\.01\.123456$/);
    assert.match(citation_text("X", CHAPTER), / In: CRISPR\. Methods in Molecular Biology 1311, 101-120 \(2020\)\./);
});

test("RIS for a paper: every field, in order, CRLF lines, TY first and ER last", () => {
    assert.equal(citation_ris("7CCD", PAPER), [
        "TY  - JOUR",
        "TI  - DNA backbone interactions impact sulfur-binding domains",
        "AU  - Yu, Hao", "AU  - Zhao, Yong Liang", "AU  - Koag, Myong-Chul",
        "T2  - Nucleic Acids Research", "J2  - Nucleic Acids Res",
        "VL  - 48", "IS  - 15", "SP  - 8755", "EP  - 8766", "PY  - 2020", "SN  - 0305-1048",
        "DO  - 10.1093/nar/gkaa574", "AN  - PMID:32621606",
        "UR  - https://doi.org/10.1093/nar/gkaa574",
        "AB  - Sulfur binds.",
        "N1  - Structure: PDB entry 7CCD, doi:10.2210/pdb7ccd/pdb",
        "ER  - ", ""].join("\r\n"));
});

test("RIS for an unpublished entry is unpublished work, with no year, journal or DOI made up", () => {
    let ris = citation_ris("5EDW", UNPUBLISHED);
    let tags = ris.split("\r\n").filter(Boolean).map((l) => l.slice(0, 2));
    assert.deepEqual(tags, ["TY", "TI", "AU", "AU", "UR", "N1", "ER"]);
    assert.match(ris, /^TY  - UNPB\r\n/);
    assert.match(ris, /\r\nAU  - Koag, M\.-C\.\r\n/);
    assert.match(ris, /UR  - https:\/\/doi\.org\/10\.2210\/pdb5edw\/pdb\r\n/);
    assert.match(ris, /N1  - To be published\. Structure: PDB entry 5EDW/);
});

test("RIS for a chapter: the book as T2, the series as T3, the ISBN and publisher", () => {
    let ris = citation_ris("4OPJ", CHAPTER);
    assert.match(ris, /^TY  - CHAP\r\n/);
    assert.match(ris, /\r\nT2  - CRISPR\r\nT3  - Methods in Molecular Biology\r\n/);
    assert.match(ris, /\r\nSN  - 9781493927623\r\nPB  - Springer New York\r\n/);
    assert.ok(!/^J2/m.test(ris));
});

test("RIS for a preprint says so", () => {
    let ris = citation_ris("X", PREPRINT);
    assert.match(ris, /\r\nT2  - bioRxiv\r\n/);
    assert.match(ris, /N1  - Preprint\. Structure:/);
});

test("RIS leaves out an empty field rather than writing an empty tag; one KW per keyword", () => {
    let ris = citation_ris("X", { ...PAPER, volume: null, page_last: null, pubmed: null, keywords: ["RNA", "tRNA"] });
    assert.ok(!/^VL|^EP|^AN/m.test(ris));
    assert.match(ris, /^SP  - 8755\r$/m);
    assert.match(ris, /\r\nKW  - RNA\r\nKW  - tRNA\r\n/);
});

test("BibTeX for a paper: full names, braced title, en-dash pages", () => {
    assert.equal(citation_bibtex("7CCD", PAPER), [
        "@article{PDB7CCD,",
        "  author    = {Yu, Hao and Zhao, Yong Liang and Koag, Myong-Chul},",
        "  title     = {{DNA backbone interactions impact sulfur-binding domains}},",
        "  journal   = {Nucleic Acids Research},",
        "  issn      = {0305-1048},",
        "  volume    = {48},",
        "  number    = {15},",
        "  pages     = {8755--8766},",
        "  year      = {2020},",
        "  doi       = {10.1093/nar/gkaa574},",
        "  url       = {https://doi.org/10.1093/nar/gkaa574},",
        "  pmid      = {32621606},",
        "  abstract  = {Sulfur binds.},",
        "  note      = {Structure: PDB entry 7CCD, doi:10.2210/pdb7ccd/pdb}",
        "}", ""].join("\n"));
});

test("BibTeX spaces the PDB's initials, which BibTeX would read as one", () => {
    assert.match(citation_bibtex("X", { ...PAPER, source: "pdb", authors: [pdb_author("Zhao, Y.L.")] }),
                 /author {4}= \{Zhao, Y\. L\.\},/);
});

test("BibTeX for a chapter is @incollection with the book and series", () => {
    let bib = citation_bibtex("4OPJ", CHAPTER);
    assert.match(bib, /^@incollection\{PDB4OPJ,/);
    assert.match(bib, /booktitle = \{CRISPR\},\n {2}series {4}= \{Methods in Molecular Biology\},/);
    assert.match(bib, /isbn {6}= \{9781493927623\},/);
    assert.ok(!/journal/.test(bib));
});

test("BibTeX braces an organisation and escapes LaTeX's special characters", () => {
    let bib = citation_bibtex("5EDW", { ...UNPUBLISHED, title: "50% of R&D_x {a} #1 $5 ~ ^ \\" });
    assert.match(bib, /^@unpublished\{PDB5EDW,/);
    assert.match(bib, /and \{Midwest Center for Structural Genomics \(MCSG\)\}\}/);
    assert.match(bib, /title {5}= \{\{50\\% of R\\&D\\_x \\\{a\\\} \\#1 \\\$5 \\textasciitilde\{\} \\textasciicircum\{\} \\textbackslash\{\}\}\}/);
    assert.ok(!/^\s+(journal|year|doi|volume|pages) +=/m.test(bib), "nothing invented for an unpublished entry");
});

test("a DOI stays verbatim in BibTeX, where an underscore in a title is escaped", () => {
    let bib = citation_bibtex("4OPJ", { ...PAPER, title: "CRISPR_Cas", doi: "10.1007/978-1-4939-2763-0_8" });
    assert.match(bib, /doi {7}= \{10\.1007\/978-1-4939-2763-0_8\},/);
    assert.match(bib, /url {7}= \{https:\/\/doi\.org\/10\.1007\/978-1-4939-2763-0_8\},/);
    assert.match(bib, /title {5}= \{\{CRISPR\\_Cas\}\},/);
});

test("a title ending in a spaced full stop loses both", () => {
    let c = { ...PAPER, title: "Transcription initiation in Escherichia coli ." };
    assert.match(citation_ris("7EH2", c), /\r\nTI  - Transcription initiation in Escherichia coli\r\n/);
    assert.match(citation_bibtex("7EH2", c), /title {5}= \{\{Transcription initiation in Escherichia coli\}\},/);
    assert.match(citation_text("7EH2", c), / Escherichia coli\. Nucleic/);
});
