import { useEffect, useRef, useState } from "react";
import LbnInfo from "./LbnInfo.jsx";
import { LABEL, columnWords, lbnLines, scrollFor } from "../lbn.js";
import { SIDE } from "../reading.js";
import { useMedia } from "../hooks/useMedia.js";
import { useOneD } from "../hooks/useOneD.js";

// Where the columns are, from the seq line (the second: the first holds only
// the strand names). The text is monospaced, so columns are evenly spaced.
function measure(pre, map) {
  const text = pre.firstChild;
  const from = text.data.indexOf("\n") + 1;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, from + map.seq.length);
  const line = range.getBoundingClientRect();
  const width = line.width / map.seq.length;
  return { line, width, left: line.left - pre.getBoundingClientRect().left - pre.clientLeft + pre.scrollLeft };
}

// The 1D panel's lines (views.js draw): the row names, which stay put while
// the lines scroll under a long sequence, the lines with the shown column
// and its partners marked behind the text, the words under them, and the
// text file.
// pin, tableRows, onFindRow: the link with the Base pairs table (usePairLink).
function OneD({ pdbId, pin, tableRows, onFindRow }) {
  const { map, error, sel, shown, onPoint, onKeep } = useOneD(pdbId, pin);
  const side = useMedia(SIDE);
  const pre = useRef(null);
  const info = useRef(null);
  const [ruler, setRuler] = useState(null);
  const keepRuler = (at) => setRuler((was) => (was?.width === at.width && was?.left === at.left ? was : at));
  const scrolled = useRef(null);

  // A pair from the table: the lines scrolled so both ends are in sight, then
  // the words; beside the page a short window scrolls the Views inside.
  useEffect(() => {
    if (sel.n === null || sel.n === scrolled.current) return;
    scrolled.current = sel.n;
    if (sel.pinned !== null) {
      const at = measure(pre.current, map);
      keepRuler(at);
      pre.current.scrollLeft = scrollFor(sel.pinned, sel.other, at, pre.current.clientWidth);
    }
    if (side) info.current?.scrollIntoView({ block: "nearest" });
    else document.getElementById("views").scrollIntoView({ block: "start" });
  }, [sel, map, side]);

  if (error) {
    const say = error.status === 404 ? "No nucleic-acid chain to show." : "The base pairs could not be loaded. Reload the page to try again.";
    return <div className="lbn" data-entry={pdbId}><p className="section_none">{say}</p></div>;
  }
  if (!map) return <div className="lbn" data-entry={pdbId}><p className="seqmap_wait">Reading the base pairs…</p></div>;

  const lines = lbnLines(map);
  const words = shown === null ? null : columnWords(map, shown);
  // Measured as the column is chosen, as views.js does: the panel may have
  // been hidden, or the font not yet in, when the lines were drawn.
  const colAt = (ev) => {
    const at = measure(pre.current, map);
    keepRuler(at);
    const { line, width } = at;
    const i = Math.floor((ev.clientX - line.left) / width);
    return i >= 0 && i < map.seq.length && map.cols[i] ? i : null;
  };
  const file = `/api/entries/${encodeURIComponent(map.pdb_id ?? pdbId)}/sequence_map?strands=${encodeURIComponent(map.shown.join(","))}&format=text`;

  return (
    <div className="lbn" data-entry={pdbId}>
      <div className="lbn_text">
        <pre className="lbn_names" aria-hidden="true">{lines.map((l) => l.slice(0, LABEL)).join("\n")}</pre>
        <pre ref={pre} className="lbn_lines" tabIndex={0}
             aria-label={`Sequence and base pairs of strands ${map.names.join(", ")} in layered dot-bracket notation`}
             onPointerMove={(ev) => onPoint(colAt(ev))}
             onPointerLeave={(ev) => { if (ev.pointerType === "mouse") onPoint(null); }}
             onClick={(ev) => onKeep(colAt(ev))}>
          {lines.map((l) => l.slice(LABEL)).join("\n")}
          {/* The shown column first, then its partners: their place is a safe key. */}
          {words && ruler && [shown, ...words.partners].map((c, n) => (
            <span key={n} className={n ? "lbn_band lbn_partner" : "lbn_band"}
                  style={{ left: `${ruler.left + c * ruler.width}px`, width: `${ruler.width}px` }}></span>
          ))}
        </pre>
      </div>
      <LbnInfo infoRef={info} map={map} shown={shown} words={words} missing={sel.missing}
               back={sel.back && shown === sel.pinned && !side ? sel.back : null}
               tableRows={tableRows} onFindRow={onFindRow} />
      <p className="lbn_note">{map.rows.length ? "" : "No base pairs recorded. "}<a className="download download_small" href={file} download>Download as text</a></p>
    </div>
  );
}

export default OneD;
