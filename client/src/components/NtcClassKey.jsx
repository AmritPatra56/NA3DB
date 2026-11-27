import { classKey } from "../seqMap.js";

function NtcClassKey({ ntcs }) {
  return (
    <>
      <span className="seqmap_group">
        {classKey(ntcs).map((c) => (
          <span key={c.code}><i className="ntc_class_swatch" style={{ background: c.colour }}></i>{c.code} {c.name}</span>
        ))}
      </span>
      <span className="seqmap_key_note">A two-colour bar is the step's 5′ half and 3′ half. Colours: <a href="https://github.com/molstar/molstar/blob/master/packages/extensions/dnatco/src/color.ts" target="_blank" rel="noopener">DNATCO</a>.</span>
    </>
  );
}

export default NtcClassKey;
