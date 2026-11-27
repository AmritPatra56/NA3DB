export const number = (n) => n.toLocaleString("en-GB");

export const structures = (n) => (n === 1 ? "1 structure" : `${number(n)} structures`);

export const listJoin = (i, n) => (i === 0 ? "" : i === n - 1 ? " or " : ", ");

export const counted = (n, one, many) => `${number(n)} ${n === 1 ? one : many}`;
