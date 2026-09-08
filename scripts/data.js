let seed_titles = [
    "Crystal structure of a B-DNA dodecamer",
    "Solution structure of an RNA hairpin loop",
    "Z-DNA hexamer at atomic resolution",
    "Ribosomal RNA fragment bound to a protein",
    "DNA quadruplex from a telomeric repeat",
    "Transfer RNA in complex with synthetase"
];

let seed_authors = [
    "Dickerson, R.E.", "Rich, A.", "Steitz, T.A.",
    "Doudna, J.A.", "Ramakrishnan, V.", "Cech, T.R."
];

let seed_organisms = [
    "Escherichia coli", "Homo sapiens", "Saccharomyces cerevisiae",
    "Thermus thermophilus", "Drosophila melanogaster", "synthetic construct"
];

let seed_entities = [
    "DNA (5'-D(*CP*GP*CP*GP*AP*A)-3')", "Ribosomal RNA", "Transfer RNA",
    "DNA polymerase", "RNA hairpin", "Telomeric DNA"
];

let seed_methods = [
    "X-RAY DIFFRACTION", "SOLUTION NMR", "ELECTRON MICROSCOPY",
    "NEUTRON DIFFRACTION", "SOLID-STATE NMR", "THEORETICAL MODEL"
];

let seed_polymers = [
    "Nucleic acid", "Protein", "Protein/NA",
    "Oligosaccharide", "Protein/Oligosaccharide", "Other"
];

let seed_ntc = ["AA00", "AA01", "BB00", "BB07", "AB01", "ZZ01", "NANT"];

let seed_residues = ["", "5-methylcytosine", "", "pseudouridine", "", "inosine"];


let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

let entries = [];

for (let i = 0; i < 120; i++) {
    let residue = seed_residues[Math.floor(i / 7) % seed_residues.length];

    entries.push({
        pdb_id: "1" + letters[Math.floor(i / 26)] + letters[i % 26] + "A",
        title: seed_titles[i % seed_titles.length],
        author: seed_authors[Math.floor(i / 6) % seed_authors.length],
        method: seed_methods[Math.floor(i / 2) % seed_methods.length],
        resolution: 1 + (i % 26) / 10,
        deposition_date: (1995 + (i % 30)) + "-06-15",
        entity_name: seed_entities[Math.floor(i / 3) % seed_entities.length],
        source_organism: seed_organisms[Math.floor(i / 4) % seed_organisms.length],
        nonstandard_residue: residue,
        assigned_ntc: seed_ntc[i % seed_ntc.length],
        confal_score: (i * 17) % 101,
        polymer_type: seed_polymers[Math.floor(i / 5) % seed_polymers.length],
        monomer_flag: residue === "" ? "Standard" : "Non-Standard"
    });
}
