import { Fragment } from "react";
import CopyButton from "./CopyButton.jsx";

// A polymer's sequence in lines of 60, as sequence_lines() in detail.js
// sends it: each line a list of runs, plain letters or a marked span.
function Sequence({ pdbId, entityId, sequence }) {
  // What Copy puts on the clipboard: the letters only, no numbers, no spaces.
  const letters = sequence.lines.flatMap((line) => line.runs.map((run) => run.text)).join("").replace(/\s/g, "");

  return (
    <details className="sequence">
      <summary>Show sequence</summary>
      <div className="sequence_body">
        {sequence.lines.map((line) => (
          <div key={line.start}>
            <span className="sequence_num">{line.start}</span>
            <span className="sequence_text">
              {/* Runs never move or change once drawn, so their place is a safe key. */}
              {line.runs.map((run, i) => run.mark
                ? <span key={i} className={`sequence_${run.mark}`} title={run.title}>{run.text}</span>
                : <Fragment key={i}>{run.text}</Fragment>)}
            </span>
          </div>
        ))}
      </div>
      <div className="sequence_foot">
        {sequence.modified && <span><span className="sequence_modified">G</span> modified, shown as its parent; hover for the code</span>}
        {sequence.unmodelled && <span><span className="sequence_unmodelled">C</span> not modelled in any chain</span>}
        <span className="sequence_actions">
          <CopyButton text={letters} title="Copy sequence" />
          <a className="download download_small" href={`/structure/${pdbId}/fasta/${entityId}`} download title="Download as FASTA">FASTA</a>
        </span>
      </div>
    </details>
  );
}

export default Sequence;
