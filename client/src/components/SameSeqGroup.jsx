import { useState } from "react";
import SameSeqEntry from "./SameSeqEntry.jsx";
import { ROWS_SHOWN, leadText, refName, sortedEntries } from "../sameSeq.js";

// One group of the Same sequence section (sameseq.js draw_group): the lead
// line, the table with the first ten entries, and Show all for the rest.
function SameSeqGroup({ group, many }) {
  const [all, setAll] = useState(false);
  const lead = leadText(group, many);
  const entries = sortedEntries(group);
  return (
    <div className="ss_group">
      <p className="ss_lead">{lead.head && <><b>{lead.head}</b>{" "}</>}{lead.text}</p>
      <div className="ss_table_wrap">
        <table className="ss_table">
          <thead><tr><th scope="col">Entry</th><th scope="col">What it is</th><th scope="col">Resolution</th>
            <th scope="col">Chain</th><th scope="col">Compared with {refName(group)}</th><th scope="col"><span className="visually_hidden">Compare</span></th></tr></thead>
          {entries.map((e, k) => (
            <SameSeqEntry key={e.entry} e={e} refId={group.ref} best={group.best}
                          hidden={k >= ROWS_SHOWN ? !all : undefined} />
          ))}
        </table>
      </div>
      {entries.length > ROWS_SHOWN && !all && (
        <button type="button" className="ss_show" onClick={() => setAll(true)}>Show all {entries.length} entries</button>
      )}
    </div>
  );
}

export default SameSeqGroup;
