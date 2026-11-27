import { useRef, useState } from "react";
import SeqMapView from "./SeqMapView.jsx";
import SeqMapFull from "./SeqMapFull.jsx";
import { useApi } from "../hooks/useApi.js";
import { useNear } from "../hooks/useNear.js";
import { fileUrl, strandNote, strandsAfter } from "../seqMap.js";

function SeqMap({ pdbId, expanded, onExpand, onCollapse }) {
  const box = useRef(null);
  const near = useNear(box);
  const [strands, setStrands] = useState([]);
  const ask = strands.length ? `?strands=${encodeURIComponent(strands.join(","))}` : "";
  const res = useApi(near ? `/api/entries/${encodeURIComponent(pdbId)}/sequence_map${ask}` : null);
  const map = res.data ?? res.stale;

  if (res.error) {
    return <div ref={box} className="seqmap" data-entry={pdbId}><p className="section_none">The sequence map could not be drawn. Reload the page to try again.</p></div>;
  }
  if (!map) return <div ref={box} className="seqmap" data-entry={pdbId}><p className="seqmap_wait">Drawing the sequence map…</p></div>;

  return (
    <>
      <div ref={box} className="seqmap" data-entry={pdbId}>
        <div className="seqmap_tools">
          <div className="seqmap_chips" role="group" aria-label="Strands on the ruler">
            {map.strands.map((s) => {
              const on = map.shown.includes(s.key);
              const partner = !on && map.shown.some((k) => s.partners.includes(k));
              return (
                <button key={s.key} type="button" className={`seqmap_chip${partner ? " seqmap_partner" : ""}`} aria-pressed={on}
                        title={strandNote(map, s)} onClick={() => { const keys = strandsAfter(map, s); if (keys.length) setStrands(keys); }}>{s.name}</button>
              );
            })}
          </div>
          <span className="seqmap_buttons">
            <button type="button" className="seqmap_full" aria-expanded={expanded} title="Expand here, with every strand and an overview"
                    onClick={expanded ? onCollapse : onExpand}>{expanded ? "⤡ Collapse" : "⤢ Expand"}</button>
            <a className="download download_small seqmap_file" href={fileUrl(map)} download title="The rows as text, in layered dot-bracket notation">Download notation</a>
          </span>
        </div>
        <SeqMapView key={map.shown.join(",")} map={map} />
      </div>
      {expanded && <SeqMapFull first={map} onCollapse={onCollapse} />}
    </>
  );
}

export default SeqMap;
