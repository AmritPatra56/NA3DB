import SameSeqBar from "./SameSeqBar.jsx";
import SameSeqPanel from "./SameSeqPanel.jsx";
import { W, W_FULL } from "../sameSeqChart.js";

// A group's comparison (sameseq.js .ss_compare): the bar, then, once run,
// "Comparing…", the reply drawn, or why not. cmp: useCompare(group).
// boxRef: where a row's Compare scrolls to.
function SameSeqCompare({ group, cmp, expanded, boxRef, onExpand, onCollapse }) {
  let body = null;
  if (cmp.open) {
    if (cmp.error) body = <p className="seqmap_wait">These two chains could not be compared. Try again.</p>;
    else if (!cmp.data) body = <p className="seqmap_wait">Comparing…</p>;
    // A new run starts over: nothing pinned or picked.
    else body = <SameSeqPanel key={cmp.runs} d={cmp.data} w={expanded ? W_FULL : W} sel={cmp.sel} onSelect={cmp.onSelect} />;
  }
  return (
    <div ref={boxRef} className="ss_compare">
      <SameSeqBar group={group} a={cmp.a} b={cmp.b} open={cmp.open} expanded={expanded}
                  onPick={cmp.onPick} onSwap={cmp.onSwap} onRun={cmp.onRun} onExpand={onExpand} onCollapse={onCollapse} />
      <div className="ss_panel" hidden={!cmp.open}>{body}</div>
    </div>
  );
}

export default SameSeqCompare;
