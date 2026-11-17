// help_texts.js - the short help notes: the 12 "?" notes on the structure
// page and the report's "Why three tables?". Wording changes here, without
// touching a template. Plain text only: no HTML, no em dashes. Each key says
// where it shows. The structure page keys are the section ids in detail.js;
// help.test.js checks every key is used.
//
// The longer guides mix text with links, swatches or a drawing, so each one
// stays in the template that draws it:
//   How the colours work      views/structure.ejs, Conformation section
//   How to read the map       views/includes/map_guide.ejs
//   How to read the picture   public/sameseq.js, draw_panel()

export default {
    // Structure page, Overview band, under its "?"
    "overview": "What the entry is: its title, how it was solved, when it was deposited, at what resolution, by whom and in which paper, what it is made of, and its size in chains, residues, nucleotides and atoms. From the entry's own PDB record.",

    // Structure page, Molecules band, under its "?"
    "molecules": "Each polymer once, with the chains that are copies of it. Modelled is how many of its residues have coordinates, out of the full sequence; missing ones are in the sequence but not in the model. Numbering is the authors' own residue numbers, which can skip or start above 1. Link is the molecule in UniProt or another sequence database.",

    // Structure page, Modified nucleotides band, under its "?"
    "modified-nucleotides": "Nucleotides chemically changed from A, C, G, U or T, such as PSU (pseudouridine) or 2MG (N2-methylguanosine). One row per kind in each chain, with every position it occupies, in the authors' numbering.",

    // Structure page, Ligands band, under its "?"
    "ligands": "Small molecules bound in the structure: ions, cofactors, drugs and sugars. Count is how many copies the entry holds. Each code links to its page at RCSB. Water is left out.",

    // Structure page, Sources band, under its "?"
    "sources": "Where each molecule came from. Organism is where the sequence comes from, Taxonomy ID its number in NCBI Taxonomy, Produced in the host it was made in when expressed.",

    // Structure page, Base pairs band, under its "?"
    "base-pairs": "Every base pair in the first model, named in the Leontis–Westhof scheme by DNATCO: c or t for cis or trans, then the two edges that touch (W Watson–Crick, H Hoogsteen, S sugar). Pairs fall in four groups: cis Watson–Crick (cWW) A–U (A–T in DNA), cWW G–C, cWW G–U, and Others, which holds every other pair and is broken down by family. A modified base counts as the base it came from. The picture shows biological assembly 1: the molecule as it works in the cell, as the depositors define it in the file. The asymmetric unit is what the file itself holds, which can be several copies of the molecule, or half of one that symmetry completes; the counts are always those of the file. Pairs that cross others are drawn under the line, so the main structure above reads clearly, like a tRNA's cloverleaf.",

    // Structure page, Views band (1D, 2D, 3D), under its "?"
    "views": "Three ways to look at the nucleic acids; pick one and it opens below. 1D is the sequence with every base pair in layered dot-bracket notation: one row per Leontis–Westhof family, brackets of a deeper kind where pairs cross, & between strands. WC holds the Watson–Crick pairs (A–U, G–C, A–T), cWW the other cis Watson–Crick pairs such as G–U. A lower-case letter is a modified nucleotide. Point at or tap a nucleotide to see what it pairs with. The Sequence map adds the backbone steps and more strands. 2D and 3D are kept for a secondary-structure diagram and a 3D viewer, still to come; 3D links to viewers on other sites meanwhile.",

    // Structure page, Sequence map band, under its "?"
    "sequence-map": "Every nucleotide on one ruler: a bar for the step to the next one (its NtC in DNATCO's colours, 5′ half and 3′ half; height its confal score), the sequence, then every base pair in bracket rows, one row per Leontis–Westhof family. Point at a column, or tap it, to see its pairs and step. How to read the map explains the rows.",

    // Structure page, Same sequence band, under its "?"
    "same-sequence": "Every chain in NA3DB with exactly this sequence, letter for letter (plain A, C, G, T or U only). Compare any two: their base pairs, the backbone shape of each step and the chemistry of each nucleotide, position by position. A nucleotide one of them does not model is never counted as a difference.",

    // Structure page, Conformation band, under its "?"
    "conformation": "Each step from one nucleotide to the next gets an NtC class from DNATCO, such as AA00. Similar classes form a CANA class, such as AAA (A-form), and the list groups them that way. Each NtC is drawn in DNATCO's colours, one for each half of the step; How the colours work has the key. The confal score (0 to 100) says how well the steps fit their classes; the percentile ranks it against other structures. Steps DNATCO could not class (NANT) are counted last.",

    // Structure page, Citations band, under its "?"
    "citations": "The paper the depositors name for this structure, the one to cite. Save reference gives a file for EndNote, Zotero, Mendeley (.ris) or LaTeX (.bib); Copy gives it as one line of text. Taken from the publisher's record (Crossref) and PubMed, checked against each other and the PDB: full author names, journal, issue, pages, abstract and keywords. An entry not yet in a paper is saved as unpublished work, linked to its PDB entry.",

    // Structure page, Links and downloads band, under its "?"
    "links": "This entry elsewhere, and its data as files.",

    // Report page, the "Why three tables?" note above the tables
    "report-tables": "A structure holds many molecules and ligands. In a single table, its title and paper would repeat on every line and counts would go wrong. So each table has one kind of row, and Entry ID links them, ready to join in Excel, R or pandas.",
};
