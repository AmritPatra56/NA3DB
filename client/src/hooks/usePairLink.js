import { useState } from "react";

export function usePairLink() {
  const [link, setLink] = useState({ pin: null, rowOn: null, find: null, n: 0 });
  return {
    ...link,
    onShowPair: (a, b, row) => setLink((was) => ({ ...was, pin: { a, b, row, n: was.n + 1 }, rowOn: row, n: was.n + 1 })),
    onFindRow: (row) => setLink((was) => ({ ...was, rowOn: row, find: { row, n: was.n + 1 }, n: was.n + 1 })),
  };
}
