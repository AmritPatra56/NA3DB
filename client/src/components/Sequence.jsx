import { Fragment } from "react";

// A polymer's sequence in lines of 60, as sequence_lines() in detail.js
// sends it: each line a list of runs, plain letters or a marked span.
function Sequence({ pdbId, entityId, sequence }) {
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
          <button type="button" className="sequence_copy" title="Copy sequence" aria-label="Copy sequence">
            <svg className="icon_copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
            <svg className="icon_done" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </button>
          <a className="download download_small" href={`/structure/${pdbId}/fasta/${entityId}`} download title="Download as FASTA">FASTA</a>
        </span>
      </div>
    </details>
  );
}

export default Sequence;
