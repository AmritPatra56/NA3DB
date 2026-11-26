import { useState } from "react";
import { useApi } from "./useApi.js";
import { comparePath, firstOther } from "../sameSeqChart.js";

// A group's comparison (sameseq.js st, run, fill_selects): the two chains
// picked, whether it is open, the difference picked, and the reply.
// runs: a new number each time it is run, so the same pair asked again
// starts over (as run does: "Comparing…", nothing picked).
export function useCompare(group) {
  const [st, setSt] = useState(() => ({ a: group.ref, b: firstOther(group), open: false, runs: 0, sel: null }));
  const res = useApi(st.open ? comparePath(st.a, st.b) : null, 0, st.runs);

  const run = (next) => setSt((was) => ({ ...was, ...next, open: true, runs: was.runs + 1, sel: null }));
  // A picked chain or a swap runs again only once it is open.
  const change = (next) => setSt((was) => (was.open ? { ...was, ...next, runs: was.runs + 1, sel: null } : { ...was, ...next }));

  return {
    ...st,
    data: res.data,
    error: res.error,
    onPick: (side, v) => change({ [side]: v }),
    onSwap: () => change({ a: st.b, b: st.a }),
    onRun: () => run({}),
    onRow: (a, b) => run({ a, b }),
    // A new object each time, so picking the same one again shows it again.
    onSelect: (n) => setSt((was) => ({ ...was, sel: { n } })),
  };
}
