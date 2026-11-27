import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import SameSeqEntry from "./SameSeqEntry.jsx";
import SameSeqCompare from "./SameSeqCompare.jsx";
import SameSeqDialog from "./SameSeqDialog.jsx";
import { useCompare } from "../hooks/useCompare.js";
import { ROWS_SHOWN, leadText, refName, sortedEntries } from "../sameSeq.js";

function SameSeqGroup({ group, many, expanded, onExpand, onCollapse }) {
  const [all, setAll] = useState(false);
  const cmp = useCompare(group);
  const box = useRef(null);
  const lead = leadText(group, many);
  const entries = sortedEntries(group);
  const full = expanded && cmp.open;
  // flushSync: show "Comparing…" before scrolling.
  const onRow = (a, b) => {
    flushSync(() => cmp.onRow(a, b));
    box.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const compare = <SameSeqCompare group={group} cmp={cmp} expanded={full} boxRef={box} onExpand={onExpand} onCollapse={onCollapse} />;
  return (
    <>
      <div className="ss_group">
        <p className="ss_lead">{lead.head && <><b>{lead.head}</b>{" "}</>}{lead.text}</p>
        <div className="ss_table_wrap">
          <table className="ss_table">
            <thead><tr><th scope="col">Entry</th><th scope="col">What it is</th><th scope="col">Resolution</th>
              <th scope="col">Chain</th><th scope="col">Compared with {refName(group)}</th><th scope="col"><span className="visually_hidden">Compare</span></th></tr></thead>
            {entries.map((e, k) => (
              <SameSeqEntry key={e.entry} e={e} refId={group.ref} best={group.best}
                            pressed={cmp.open && cmp.a === group.ref ? cmp.b : null}
                            hidden={k >= ROWS_SHOWN ? !all : undefined} onRow={onRow} />
            ))}
          </table>
        </div>
        {entries.length > ROWS_SHOWN && !all && (
          <button type="button" className="ss_show" onClick={() => setAll(true)}>Show all {entries.length} entries</button>
        )}
        {!full && compare}
      </div>
      {full && <SameSeqDialog onCollapse={onCollapse}>{compare}</SameSeqDialog>}
    </>
  );
}

export default SameSeqGroup;
