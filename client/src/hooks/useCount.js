import { useState } from "react";
import { useApi } from "./useApi.js";
import { COUNT_SETTLE_MS } from "../constants.js";

// The Search button's count (count_soon): every edit asks again once the
// typing pauses, the same filters too, as every input or pill click does. A
// search drops a count still on its way: its answer brings its own number.
//
// getPath(form): the count's request for the form as edited.
// Returns count (useApi's answer), cleared (when the box's count was last
// cleared), ask(form), drop() and clearBox().
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
