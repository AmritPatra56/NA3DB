import NtcSwatch from "./NtcSwatch.jsx";
import { WHO, familyWords } from "../sameSeqChart.js";

export const HINT = "Hover or tap a column: what each chain has there shows here.";

function StepText({ s }) {
  if (!s) return <span className="ss_dim">no step</span>;
  if (!s[3]) return <><NtcSwatch ntc={null} /> <span className="ss_dim">no NtC class</span></>;
  return <><NtcSwatch ntc={s[3]} /> <b>{s[3]}</b> {s[1]} · confal {s[2] === null ? "?" : Math.round(s[2])}</>;
}

function SameSeqInfo({ d, look, shown }) {
  if (shown === null) return <div className="seqmap_info ss_info" aria-live="polite"><span className="seqmap_hint">{HINT}</span></div>;
  const c = d.cols[shown];
  const { name } = look;
  const gone = [!c[3] && "not modelled in A", !c[4] && "not modelled in B"].filter(Boolean);
  const at = look.at[shown];
  const step = (k) => (k < 0 || k >= d.length - 1 ? null : (
    <span className="ss_hstep">step {name(k)}→{name(k + 1)}: A <StepText s={look.steps.a.get(k)} /> · B <StepText s={look.steps.b.get(k)} /></span>
  ));
  return (
    <div className="seqmap_info ss_info" aria-live="polite">
      <span className="seqmap_res">
        <b>{name(shown)}</b>
        {c[1] !== c[2] && <> <span className="ss_dim">A numbers it {c[1]}, B {c[2]}</span></>}
        {c[5] === c[6] ? c[5] !== c[0].toUpperCase() && <> <span className="ss_dim">{c[5]} in both</span></>
          : <> <span>A: <b>{c[5]}</b>, B: <b>{c[6]}</b></span></>}
        {gone.length > 0 && <> <span className="ss_gone_text">{gone.join(", ")}</span></>}
        {" "}
        {at.length ? <span className="ss_hdiff">{at.length === 1 ? "difference" : "differences"} {at.map((k) => <span key={k} className="ss_n">{k}</span>)}</span>
          : <span className="ss_dim">· nothing differs here</span>}
      </span>
      <span className="ss_hpairs">
        {look.links[shown].length ? look.links[shown].map((l) => (
          <span key={`${l.to} ${l.family} ${l.who}`} className={`ss_hpair ss_w_${l.who === "=" ? "both" : l.who}`}>
            pairs with <b>{name(l.to)}</b>, {l.wc ? "Watson–Crick" : l.family} <span className="ss_dim">({familyWords(l.family)})</span>: {WHO[l.who]}
          </span>
        )) : <span className="ss_dim">no base pair in either chain</span>}
      </span>
      {step(shown - 1)}{step(shown)}
    </div>
  );
}

export default SameSeqInfo;
