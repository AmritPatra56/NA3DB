import { Fragment, useRef } from "react";
import SameSeqChart from "./SameSeqChart.jsx";
import { VERDICT_ICON } from "../sameSeq.js";
import { scrollFor } from "../sameSeqChart.js";

function openMapGuide(ev) {
  const guide = document.getElementById("sequence-map-guide");
  if (!guide) return;
  ev.preventDefault();
  guide.open = true;
  guide.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SameSeqPanel({ d, w, sel, onSelect }) {
  const s = d.summary;
  const scroll = useRef(null);
  const list = useRef(null);
  const end = useRef(null);

  const pick = (n, fromList) => {
    const x = d.diffs[n - 1];
    if (!x) return;
    onSelect(n);
    if (!fromList) list.current.querySelector(`[data-n="${n}"]`).scrollIntoView({ block: "nearest", behavior: "smooth" });
    const box = scroll.current;
    let { left, long } = scrollFor(x, w, box.clientWidth, false);
    if (fromList && long) {
      // Both ends do not fit: a second click goes to the far one.
      if (end.current === n) { left = scrollFor(x, w, box.clientWidth, true).left; end.current = null; }
      else end.current = n;
    }
    box.scrollTo({ left, behavior: "smooth" });
  };

  return (
    <>
      <div className="ss_head">
        <p className={`ss_big ss_v_${s.verdict}`}><b className="ss_icon" aria-hidden="true">{VERDICT_ICON[s.verdict]}</b>{s.headline}</p>
        <p className="ss_facts">
          <span className="ss_ab ss_ab_a">A</span> {d.a} <span className="ss_ab ss_ab_b">B</span> {d.b}
          {s.facts.map((f, k) => <Fragment key={k}> <span className="ss_dot">·</span> {f}</Fragment>)}
        </p>
      </div>
      <details className="guide ss_how">
        <summary>How to read the picture</summary>
        <div className="guide_body"><ul className="guide_rules">
          <li><b>Backbone:</b> A's steps stand up from the sequence, B's hang down. Colour is the shape, in DNATCO's NtC colours (5′ half, 3′ half), height is how sure (confal).</li>
          <li><b>Base pairs:</b> the pairs of both chains in dot-bracket rows, in the colours of the sequence map.{" "}
            <span className="ss_swatch ss_only_a">( )</span> only in A, <span className="ss_swatch ss_only_b">( )</span> only in B,{" "}
            <span className="ss_swatch ss_na">( )</span> cannot be compared, one of its nucleotides is not modelled in the other chain.</li>
          <li><b>Red numbers</b> mark each difference. The list under the picture says what each one is.</li>
          <li><b>Brackets and colours</b> read as in the sequence map: <a href="#sequence-map-guide" className="ss_guide_link" onClick={openMapGuide}>How to read the map</a>.</li>
        </ul></div>
      </details>
      <div className="ss_stage">
        <SameSeqChart d={d} w={w} sel={sel} scrollRef={scroll} onMark={(n) => pick(n, false)} />
        <div className="ss_list_box">
          {d.diffs.length ? (
            <>
              <ol ref={list} className="ss_list">
                {d.diffs.map((x) => (
                  <li key={x.n}>
                    <button type="button" data-n={x.n} className={sel?.n === x.n ? "ss_on" : undefined} onClick={() => pick(x.n, true)}>
                      <span className="ss_n">{x.n}</span><span className="ss_said">{x.text}<span className="ss_detail">{x.detail}</span></span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="ss_note">Everything without a number is the same in both. Click a number to find it.</p>
            </>
          ) : <p className="ss_note">Every base pair, every confident backbone step and every nucleotide is the same in both.</p>}
        </div>
      </div>
    </>
  );
}

export default SameSeqPanel;
