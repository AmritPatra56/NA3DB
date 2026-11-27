import NtcClassKey from "./NtcClassKey.jsx";
import { rowColour } from "../seqMap.js";

function SameSeqKey({ d }) {
  return (
    <div className="seqmap_key ss_key">
      <span className="seqmap_key_title">Backbone shape, in DNATCO's NtC colours</span>
      <NtcClassKey ntcs={[...d.steps.a, ...d.steps.b].map((s) => s[3])} />
      <span className="seqmap_key_title">Pairs</span>
      <span className="seqmap_group">
        <span><i style={{ background: rowColour("WC") }}></i>WC: Watson–Crick</span>
        <span><i style={{ background: rowColour("cWW") }}></i>cWW: other cis W–W</span>
        <span><i style={{ background: rowColour("") }}></i>other families</span>
        <span><i className="ss_only_a"></i>only in A</span>
        <span><i className="ss_only_b"></i>only in B</span>
      </span>
    </div>
  );
}

export default SameSeqKey;
