import { Fragment } from "react";
import NtcGuide from "./NtcGuide.jsx";
import { number, counted } from "../format.js";

function NtcFamilies({ ntc }) {
  return (
    <>
      <div className="pair_caption">Steps by shape, each colour named</div>
      <NtcGuide ntcKey={ntc.key} />
      {ntc.families.map((f) => (
        <Fragment key={f.name}>
          <div className="ntc_family_name">{f.name} · {counted(f.n, "step", "steps")}</div>
          {f.classes.map((c) => (
            <div key={c.cana} className="ntc_line">
              <span className="ntc_name"><b>{c.name}</b> <code>{c.cana}</code></span>
              <span className="ntc_count">{number(c.n)}</span>
              <span className="ntc_chips">
                {c.ntcs.map((x) => (
                  <span key={x.ntc} className="ntc_chip" title={`${x.ntc}: ${counted(x.n, "step", "steps")}`}>
                    <i className="cana_swatch" style={{ background: x.background }}></i>{x.ntc} ×{number(x.n)}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default NtcFamilies;
