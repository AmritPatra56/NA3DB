import { useState } from "react";
import { useApi } from "./useApi.js";
import { pairColumns, strandsOf } from "../lbn.js";

// The 1D lines' data and what they show (views.js load and draw): the map of
// the strands asked for (none: the server's choice), the column pointed at
// (point) and the one kept (pinned) by a click or the table. pin: the pair
// the table asks for, { a, b, row, n }. Not in these lines, its strands are
// asked for once; still not there, it is missing.
export function useOneD(pdbId, pin) {
  const [strands, setStrands] = useState({ list: [], n: null });
  const [sel, setSel] = useState({ point: null, pinned: null, other: null, back: null, n: null, missing: false });
  const ask = strands.list.length ? `?strands=${encodeURIComponent(strands.list.join(","))}` : "";
  const res = useApi(`/api/entries/${encodeURIComponent(pdbId)}/sequence_map${ask}`);
  const map = res.data;

  // A new ask from the table, taken as the lines come (React's "adjusting
  // state when a prop changes": no effect, no extra paint).
  if (pin && pin.n !== sel.n && map) {
    const at = pairColumns(map, pin.a, pin.b);
    if (at) setSel({ point: null, pinned: at[0], other: at[1], back: pin.row, n: pin.n, missing: false });
    else if (strands.n !== pin.n) setStrands({ list: strandsOf(pin.a, pin.b), n: pin.n });
    else setSel({ point: null, pinned: null, other: null, back: null, n: pin.n, missing: true });
  }

  return {
    map: map ?? res.stale,
    error: res.error,
    sel,
    shown: sel.point ?? sel.pinned,
    onPoint: (i) => setSel((was) => (was.point === i ? was : { ...was, point: i, missing: false })),
    onKeep: (i) => setSel((was) => ({ ...was, point: null, pinned: i === was.pinned ? null : i, back: null, missing: false })),
  };
}
