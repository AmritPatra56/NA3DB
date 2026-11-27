import { useState } from "react";
import { useApi } from "./useApi.js";
import { comparePath, firstOther } from "../sameSeqChart.js";

export function useCompare(group) {
  const [st, setSt] = useState(() => ({ a: group.ref, b: firstOther(group), open: false, runs: 0, sel: null }));
  const res = useApi(st.open ? comparePath(st.a, st.b) : null, 0, st.runs);

  const run = (next) => setSt((was) => ({ ...was, ...next, open: true, runs: was.runs + 1, sel: null }));
  const change = (next) => setSt((was) => (was.open ? { ...was, ...next, runs: was.runs + 1, sel: null } : { ...was, ...next }));

  return {
    ...st,
    data: res.data,
    error: res.error,
    onPick: (side, v) => change({ [side]: v }),
    onSwap: () => change({ a: st.b, b: st.a }),
    onRun: () => run({}),
    onRow: (a, b) => run({ a, b }),
    onSelect: (n) => setSt((was) => ({ ...was, sel: { n } })),
  };
}
