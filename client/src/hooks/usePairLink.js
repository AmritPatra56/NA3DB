import { useState } from "react";

// The Base pairs table and the 1D view, linked (views.js): a row there shown
// here, and a partner named here found back there. pin: the pair the table
// asked the 1D view to show, { a, b, row, n }; rowOn: the table row marked;
// find: the row to open the table at, { row, n }. n counts the asks, so the
// same row asked twice is shown twice.
export function usePairLink() {
  const [link, setLink] = useState({ pin: null, rowOn: null, find: null, n: 0 });
  return {
    ...link,
    onShowPair: (a, b, row) => setLink((was) => ({ ...was, pin: { a, b, row, n: was.n + 1 }, rowOn: row, n: was.n + 1 })),
    onFindRow: (row) => setLink((was) => ({ ...was, rowOn: row, find: { row, n: was.n + 1 }, n: was.n + 1 })),
  };
}
