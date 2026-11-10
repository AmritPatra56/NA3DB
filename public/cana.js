// CANA classes of NtC steps and how they are drawn, shared by the sequence
// map in the browser and the Conformation section the server renders.

// Hue is the family (A blue, B orange, Z green), shade or pattern the
// variant, two halves a transition read 5′ to 3′. Okabe–Ito colours, so they
// stay apart for colour-blind readers too. The same in both themes, except
// the two neutrals: OPN and NAN are tokens in style.css, since a black or
// white bar would vanish or glare on the dark ground.
export const CANA = {
    AAA: { fill: ["#0072B2"] },               AAw: { fill: ["#56B4E9"] },
    AAu: { fill: ["#0072B2"], look: "stripe" },
    BBB: { fill: ["#E69F00"] },               BBw: { fill: ["#E69F00"], look: "stripe" },
    miB: { fill: ["#E69F00"], look: "dot" },  BB2: { fill: ["#D55E00"] },
    "A-B": { fill: ["#0072B2", "#E69F00"] },  "B-A": { fill: ["#E69F00", "#0072B2"] },
    B12: { fill: ["#E69F00", "#D55E00"] },
    ZZZ: { fill: ["#009E73"] }, ICL: { fill: ["#CC79A7"] },
    OPN: { fill: ["var(--ntc-opn)"] }, SYN: { fill: ["#F0E442"] },
    NAN: { fill: ["var(--ntc-nan)"] }
};
export const CANA_GROUPS = [
    ["A-form family", ["AAA", "AAw", "AAu"]],
    ["B-form family", ["BBB", "BBw", "miB", "BB2"]],
    ["transitions", ["A-B", "B-A", "B12"]],
    ["Z-form", ["ZZZ"]], ["intercalated", ["ICL"]], ["opened", ["OPN"]], ["syn base", ["SYN"]],
    ["no NtC class", ["NAN"]]
];

// What each class is, in plain words, from DNATCO's definitions (Černý et
// al. 2020, NAR 48:6367, Table 1). The colours above are NA3DB's own.
export const CANA_NAMES = {
    AAA: "A-form", AAw: "A-like, α/γ switched", AAu: "A-like, bases apart",
    BBB: "B-form (BI)", BBw: "B-like, lesser BI", miB: "minor B", BB2: "BII form",
    "A-B": "A to B", "B-A": "B to A", B12: "BI to BII",
    ZZZ: "Z-form", ICL: "room for an intercalated base", OPN: "opened, bases unstacked",
    SYN: "one base syn", NAN: "no NtC class"
};
