// build_citations.test.js - the rules that pick each field of a reference.
import test from "node:test";
import assert from "node:assert";
import { expand_pages, clean_crossref_title, restore_angstrom, plain, key, publisher_text, similar,
         name_journals, JOURNALS } from "./build_citations.mjs";

test("MEDLINE's short page ranges are written out; Cell's .e pages and article ids kept", () => {
    assert.deepEqual(expand_pages("143-56"), { first: "143", last: "156" });
    assert.deepEqual(expand_pages("1022-1035.e3"), { first: "1022", last: "1035.e3" });
    assert.deepEqual(expand_pages("e1-e3"), { first: "e1", last: "e3" });
    assert.deepEqual(expand_pages("gkaf604"), { first: "gkaf604", last: null });
    assert.deepEqual(expand_pages(null), { first: null, last: null });
});

test("Crossref titles lose Elsevier's Edited by and ACS's codes, and keep the decimal point", () => {
    assert.equal(clean_crossref_title("Crystal structure at 2·25 Å resolution 1 1Edited by A. Klug"),
                 "Crystal structure at 2.25 Å resolution");
    assert.equal(clean_crossref_title("Z-DNA at 1.5 .ANG. with G.cntdot.C pairs"), "Z-DNA at 1.5 Å with G·C pairs");
    assert.equal(clean_crossref_title(".UNKNOWN. code stays"), ".UNKNOWN. code stays");
});

test("Å is put back in an old PubMed title only when the publisher has as many", () => {
    assert.equal(restore_angstrom("Structure at 2.5 A resolution", "Structure at 2.5 Å resolution"),
                 "Structure at 2.5 Å resolution");
    assert.equal(restore_angstrom("Structure at 2.5 A resolution", "Structure at 2.5 resolution"),
                 "Structure at 2.5 A resolution");
    assert.equal(restore_angstrom("A 2 A-form", "A 2 Å"), "A 2 A-form");
});

test("plain text: tags out, a subscript joined to its word, entities decoded", () => {
    assert.equal(plain("Ag <sub> 16 </sub> clusters"), "Ag16 clusters");
    assert.equal(plain("<i>E. coli</i>  tRNA&amp;"), "E. coli tRNA&");
    assert.equal(plain("  "), null);
    assert.equal(plain(null), null);
});

test("the comparison key spells out Greek and drops accents", () => {
    assert.equal(key("Pol η"), key("Pol eta"));
    assert.equal(key("Andrałojć"), "andralojc");
    assert.equal(key("G x A pairs"), key("GA pairs"));
});

test("the publisher's text only when it is PubMed's title word for word", () => {
    // (PubMed, Crossref)
    assert.ok(publisher_text("Cys-tRNACys-EF-Tu-GDPNP reveals", "Cys-tRNACys–EF-Tu–GDPNP reveals"));
    assert.ok(publisher_text("Structure of a dna duplex", "Structure of a DNA Duplex"));
    assert.ok(!publisher_text("Structure of PAX", "Structure of pax"), "a capital lost");
    assert.ok(!publisher_text("Structure of the syn form", "Structure of thesyn form"), "words run together");
    assert.ok(!publisher_text("Structure", "STRUCTURE"), "all capitals");
});

test("similar titles are a character or two apart, more only in a long one", () => {
    assert.ok(similar("Scrunching during DNA repair", "Scrunching During DNA Repair."));
    assert.ok(!similar("Scrunching during DNA repair", "Scrunching during RNA editing"));
    assert.ok(!similar("", "x"));
});

const rec = (journal_abbrev, journal, issn, from = ["pubmed", "crossref"], type = "article") =>
    ({ journal_abbrev, journal, issn, from, type });

test("a PubMed-only paper takes its journal's name from Crossref's papers", () => {
    let rs = [rec("Nucleic Acids Res", "Nucleic Acids Research", "0305-1048"),
              rec("Nucleic Acids Res", "Nucleic Acids Research", "0305-1048"),
              rec("Nucleic Acids Res", "Nucleic acids research", "0305-1048", ["pubmed"]),
              rec("Science", "Science (New York, N.Y.)", "0036-8075", ["pubmed"]),
              rec("Science", "Science", "0036-8075")];
    name_journals(rs);
    assert.deepEqual(rs.map((r) => r.journal), ["Nucleic Acids Research", "Nucleic Acids Research", "Nucleic Acids Research",
                                                "Science", "Science"]);
});

test("a paper filed under its journal's later name gets the name and ISSN of its day", () => {
    let rs = [rec("Nat Struct Biol", "Nature Structural Biology", "1072-8368"),
              rec("Nat Struct Biol", "Nature Structural Biology", "1072-8368"),
              rec("Nat Struct Biol", "Nature Structural Biology", "1072-8368"),
              rec("Nat Struct Biol", "Nature Structural & Molecular Biology", "1545-9993")];
    name_journals(rs);
    assert.equal(rs[3].journal, "Nature Structural Biology");
    assert.equal(rs[3].issn, "1072-8368");
});

test("the publisher's own name stands when only its spelling differs", () => {
    let rs = [rec("PLoS One", "PLoS ONE", "1932-6203"), rec("PLoS One", "PLoS ONE", "1932-6203"),
              rec("PLoS One", "PLOS ONE", "1932-6203")];
    name_journals(rs);
    assert.equal(rs[2].journal, "PLOS ONE");
});

test("no name wins without two thirds of the journal; listed journals by their register name", () => {
    let rs = [rec("X J", "X Journal", "1"), rec("X J", "The X Journal", "1"), rec("X J", "x journal", "1", ["pubmed"])];
    name_journals(rs);
    assert.equal(rs[2].journal, "x journal");
    let j = [rec("J Biochem", "Journal of biochemistry", "0021-924X", ["pubmed"])];
    name_journals(j);
    assert.equal(j[0].journal, JOURNALS["J Biochem"]);
});

test("a preprint or a chapter keeps its own name", () => {
    let rs = [rec("Methods Mol Biol", "Methods in Molecular Biology", "1064-3745"),
              rec("Methods Mol Biol", "Methods in Molecular Biology", "1064-3745"),
              rec("Methods Mol Biol", "Methods in molecular biology", null, ["pubmed"], "chapter"),
              rec("Methods Mol Biol", "Springer Protocols", null, ["crossref"], "preprint")];
    name_journals(rs);
    assert.equal(rs[2].journal, "Methods in molecular biology");
    assert.equal(rs[3].journal, "Springer Protocols");
});
