import { Link } from "react-router";
import { BEST_NOTE, VERDICT_ICON, methodShort, modelled, resolution } from "../sameSeq.js";

function SameSeqEntry({ e, refId, best, pressed, hidden, onRow }) {
  const res = resolution(e.resolution);
  return (
    <tbody className={`ss_entry${hidden !== undefined ? " ss_more" : ""}`} hidden={hidden}>
      {e.chains.map((c, n) => (
        <tr key={c.id} className={c.id === refId ? "ss_ref" : undefined}>
          {n === 0 && (
            <>
              <th scope="rowgroup" rowSpan={e.chains.length} className="ss_id" data-th="Entry">
                {e.this ? <><strong>{e.entry}</strong><span className="ss_here">this page</span></>
                  : <Link to={`/structure/${encodeURIComponent(e.entry)}`}><strong>{e.entry}</strong></Link>}
              </th>
              <td rowSpan={e.chains.length} className="ss_title" data-th="What it is"><span title={e.title ?? ""}>{e.title ?? "No title"}</span></td>
              <td rowSpan={e.chains.length} className="ss_res" data-th="Resolution">{res ?? <span className="ss_dim">{methodShort(e.method)}</span>}</td>
            </>
          )}
          <td className="ss_chain" data-th="Chain">
            <b>{c.auth ?? c.label}</b>
            {c.auth && c.auth !== c.label && <>{" "}<span className="ss_label" title="label id">{c.label}</span></>}
            {c.id === best && <>{" "}<span className="ss_best" title={BEST_NOTE}>best model</span></>}
            {" "}<span className="ss_dim">{modelled(c)}</span>
          </td>
          <td className="ss_vs" data-th="Compared">
            {c.id === refId ? <span className="ss_self">the chain compared against</span>
              : <span className={`ss_verdict ss_v_${c.summary.verdict}`}><b aria-hidden="true">{VERDICT_ICON[c.summary.verdict]}</b>{c.summary.headline}</span>}
          </td>
          <td className="ss_act">
            {c.id !== refId && <button type="button" className="ss_go" data-a={refId} data-b={c.id} aria-pressed={pressed === c.id}
                                       onClick={() => onRow(refId, c.id)}>Compare</button>}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default SameSeqEntry;
