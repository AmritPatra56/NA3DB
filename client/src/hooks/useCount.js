import { useState } from "react";
import { useApi } from "./useApi.js";
import { COUNT_SETTLE_MS } from "../constants.js";

export function useCount(getPath) {
  const [asking, setAsking] = useState({ form: null, round: 0 });
  const [cleared, setCleared] = useState(0);
  const count = useApi(asking.form ? getPath(asking.form) : null, COUNT_SETTLE_MS, asking.round);
  return {
    count,
    cleared,
    ask: (form) => setAsking((was) => ({ form, round: was.round + 1 })),
    drop: () => setAsking((was) => ({ form: null, round: was.round })),
    clearBox: () => setCleared(performance.now()),
  };
}
