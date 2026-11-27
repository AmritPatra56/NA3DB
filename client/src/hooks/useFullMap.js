import { useState } from "react";
import { useApi } from "./useApi.js";

export function useFullMap(first) {
  const [asked, setAsked] = useState(null);
  const path = asked && `/api/entries/${encodeURIComponent(first.pdb_id)}/sequence_map?strands=${encodeURIComponent(asked.keys.join(","))}`;
  const res = useApi(path, 0, asked?.round ?? 0);
  const got = asked ? res.good : null;
  const map = got?.data ?? first;
  return {
    map,
    drawn: got?.at ?? 0,
    failed: Boolean(res.error),
    ticked: asked && !res.data ? asked.keys : map.shown,
    onStrands: (keys) => setAsked((was) => ({ keys, round: (was?.round ?? 0) + 1 })),
  };
}
