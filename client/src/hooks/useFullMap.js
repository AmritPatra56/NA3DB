import { useState } from "react";
import { useApi } from "./useApi.js";

// The expanded map's strands (seqmap.js full_load): it opens on the
// section's map; a tick or a quick pick asks for a new set, the last map
// drawn staying meanwhile, and after a failure. Each ask is a new round, so
// asking for the same set draws it again from its 5′ end, as seqmap.js does.
// drawn: which answer is on screen, for the map's key. ticked: the boxes as
// the reader left them, the map's own once a new set comes.
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
