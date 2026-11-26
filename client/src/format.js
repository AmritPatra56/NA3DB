// Numbers as the EJS pages write them: 1,234 (en-GB).
export const number = (n) => n.toLocaleString("en-GB");

// "1 structure", "1,234 structures".
export const structures = (n) => (n === 1 ? "1 structure" : `${number(n)} structures`);

// What goes before item i of n in "a, b or c": nothing, ", " or " or ".
export const listJoin = (i, n) => (i === 0 ? "" : i === n - 1 ? " or " : ", ");

// "1 pair", "1,234 pairs": a count with its word, one or many.
export const counted = (n, one, many) => `${number(n)} ${n === 1 ? one : many}`;
