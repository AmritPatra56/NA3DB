// NtC colours and CANA class names, shared by the sequence map in the
// browser and the Conformation section the server renders.
//
// The colours are DNATCO's own, copied exactly from DNATCO's colouring in
// Mol* (packages/extensions/dnatco/src/color.ts, MIT licence, by M. Malý and J. Černý):
// https://github.com/molstar/molstar/blob/master/packages/extensions/dnatco/src/color.ts
// Each NtC is drawn in two halves, the 5′ nucleotide's side and the 3′ one,
// and each half takes the colour of its conformer class. AB01 is A then B,
// BB07 is BII on both sides.
export const NTC_CLASS_COLOURS = {
    A: "#FFC1C1", B: "#C8CFFF", BII: "#0059DA", miB: "#3BE8FB", Z: "#01F60E",
    IC: "#FA5CFB", OPN: "#E90000", SYN: "#FFFF01", N: "#F2F2F2"
};
export const NTC_CLASS_NAMES = {
    A: "A-form", B: "B-form", BII: "BII", miB: "minor B", Z: "Z-form",
    IC: "intercalated", OPN: "opened", SYN: "syn base", N: "no NtC class"
};

// Each NtC's classes, 5′ half / 3′ half; one name when both halves agree.
const HALVES = {
    NANT: "N", AA00: "A", AA02: "A", AA03: "A", AA04: "A", AA08: "A", AA09: "A", AA01: "A",
    AA05: "A", AA06: "A", AA10: "A", AA11: "A", AA07: "A", AA12: "A", AA13: "A", AB01: "A/B",
    AB02: "A/B", AB03: "A/B", AB04: "A/B", AB05: "A/B", BA01: "B/A", BA05: "B/A", BA09: "B/A",
    BA08: "BII/A", BA10: "B/A", BA13: "BII/A", BA16: "BII/A", BA17: "BII/A", BB00: "B",
    BB01: "B", BB17: "B", BB02: "B", BB03: "B", BB11: "B", BB16: "B", BB04: "B/BII",
    BB05: "B/BII", BB07: "BII", BB08: "BII", BB10: "miB", BB12: "miB", BB13: "miB", BB14: "miB",
    BB15: "miB", BB20: "miB", IC01: "IC", IC02: "IC", IC03: "IC", IC04: "IC", IC05: "IC",
    IC06: "IC", IC07: "IC", OP01: "OPN", OP02: "OPN", OP03: "OPN", OP04: "OPN", OP05: "OPN",
    OP06: "OPN", OP07: "OPN", OP08: "OPN", OP09: "OPN", OP10: "OPN", OP11: "OPN", OP12: "OPN",
    OP13: "OPN", OP14: "OPN", OP15: "OPN", OP16: "OPN", OP17: "OPN", OP18: "OPN", OP19: "OPN",
    OP20: "OPN", OP21: "OPN", OP22: "OPN", OP23: "OPN", OP24: "OPN", OP25: "OPN", OP26: "OPN",
    OP27: "OPN", OP28: "OPN", OP29: "OPN", OP30: "OPN", OP31: "OPN", OPS1: "OPN",
    OP1S: "OPN/SYN", AAS1: "SYN/A", AB1S: "A/SYN", AB2S: "A/SYN", BB1S: "B/SYN", BB2S: "B/SYN",
    BBS1: "SYN/B", ZZ01: "Z", ZZ02: "Z", ZZ1S: "Z/SYN", ZZ2S: "Z/SYN", ZZS1: "SYN/Z",
    ZZS2: "SYN/Z"
};

// The two classes of a step, 5′ then 3′. A step with no NtC (null or NANT)
// is N on both sides; so is a code this table does not know.
export function ntc_classes(ntc) {
    let h = (ntc && HALVES[ntc]) || "N";
    let [a, b = a] = h.split("/");
    return [a, b];
}
export const ntc_fill = (ntc) => ntc_classes(ntc).map((c) => NTC_CLASS_COLOURS[c]);

// CSS drawing the same two halves as a bar.
export function ntc_background(ntc) {
    let [a, b] = ntc_fill(ntc);
    return a === b ? a : `linear-gradient(90deg, ${a} 50%, ${b} 50%)`;
}

// The CANA classes: names only, for the words beside a step. What each is,
// in plain words, from DNATCO's definitions (Černý et al. 2020, NAR 48:6367,
// Table 1).
export const CANA_NAMES = {
    AAA: "A-form", AAw: "A-like, α/γ switched", AAu: "A-like, bases apart",
    BBB: "B-form (BI)", BBw: "B-like, lesser BI", miB: "minor B", BB2: "BII form",
    "A-B": "A to B", "B-A": "B to A", B12: "BI to BII",
    ZZZ: "Z-form", ICL: "room for an intercalated base", OPN: "opened, bases unstacked",
    SYN: "one base syn", NAN: "no NtC class"
};
