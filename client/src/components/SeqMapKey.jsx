import NtcClassKey from "./NtcClassKey.jsx";
import { rowColour } from "../seqMap.js";

// The key under the map (seqmap.js key_html): the NtC classes the shown
// steps use, then the pair rows' colours.
function SeqMapKey({ map }) {
  return (
    <div className="seqmap_key">
      <span className="seqmap_key_title">NtC step, in DNATCO's colours <em>(bar height: confal)</em></span>
      <NtcClassKey ntcs={map.steps.map((s) => s.ntc)} />
      <span className="seqmap_key_title">Pairs</span>
      <span className="seqmap_group">
        <span><i style={{ background: rowColour("WC") }}></i>WC: Watson–Crick</span>
        <span><i style={{ background: rowColour("cWW") }}></i>cWW: other cis W–W</span>
        <span><i style={{ background: rowColour("") }}></i>other families</span>
        <span><b className="seqmap_mod">a</b>lower case: modified</span>
      </span>
    </div>
  );
}

export default SeqMapKey;
