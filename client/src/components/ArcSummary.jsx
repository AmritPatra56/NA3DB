import { countsOf } from "../arcView.js";
import { number } from "../format.js";

function ArcSummary({ d }) {
  const c = countsOf(d);
  const strands = d.strands.length;
  const names = d.strands.slice(0, 6).map((s) => s.name).join(", ") + (strands > 6 ? "…" : "");
  const items = [
    ["Base pairs", number(d.pairs.length)],
    ["cWW Watson–Crick", number(c.kinds.wc)],
    ["cWW G–U", number(c.kinds.gu)],
    ["Others", <>{number(c.kinds.nc)}{c.kinds.nc > 0 && <> <small>{c.families} {c.families === 1 ? "family" : "families"}</small></>}</>],
    ["Nucleotides", <>{number(c.nucleotides)}{c.modified > 0 && <> <small>{number(c.modified)} modified</small></>}</>],
    ["Strands", <>{number(strands)} <small>{names}</small></>],
  ];
  return items.map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>);
}

export default ArcSummary;
