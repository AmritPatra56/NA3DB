import { useRef } from "react";
import SameSeqGroup from "./SameSeqGroup.jsx";
import { useApi } from "../hooks/useApi.js";
import { useNear } from "../hooks/useNear.js";
import { NO_SAME_SEQUENCE } from "../constants.js";

// The Same sequence section's body (sameseq.js load): asked for once the
// section comes near, then a group per sequence shared with other entries.
function SameSeq({ pdbId }) {
  const box = useRef(null);
  const near = useNear(box);
  const res = useApi(near ? `/api/entries/${encodeURIComponent(pdbId)}/same_sequence` : null);
  const groups = res.data?.groups;

  let body;
  if (res.error) body = <p className="seqmap_wait">The chains with this sequence could not be listed. Reload the page to try again.</p>;
  else if (!groups) body = <p className="seqmap_wait">Finding the chains with this sequence…</p>;
  else if (!groups.length) body = <p className="section_none">{NO_SAME_SEQUENCE}</p>;
  else body = groups.map((g) => <SameSeqGroup key={g.ref} group={g} many={groups.length > 1} />);

  return <div ref={box} className="sameseq" data-entry={pdbId}>{body}</div>;
}

export default SameSeq;
