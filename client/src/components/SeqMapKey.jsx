import { classKey, rowColour } from "../seqMap.js";

// The key under the map (seqmap.js key_html): the NtC classes the shown
// steps use, then the pair rows' colours.
function SeqMapKey({ map }) {
  return (
    <div className="seqmap_key">
      <span className="seqmap_key_title">NtC step, in DNATCO's colours <em>(bar height: confal)</em></span>
      <span className="seqmap_group">
        {classKey(map.steps.map((s) => s.ntc)).map((c) => (
          <span key={c.code}><i className="ntc_class_swatch" style={{ background: c.colour }}></i>{c.code} {c.name}</span>
        ))}
      </span>
      <span className="seqmap_key_note">A two-colour bar is the step's 5′ half and 3′ half. Colours: <a href="https://github.com/molstar/molstar/blob/master/packages/extensions/dnatco/src/color.ts" target="_blank" rel="noopener">DNATCO</a>.</span>
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
