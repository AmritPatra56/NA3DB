import { Link } from "react-router";
import { useState } from "react";
import { cardParts, entryHref } from "../resultCard.js";
import { go } from "../address.js";

function ResultCard({ entry }) {
  const [more, setMore] = useState(false);
  const p = cardParts(entry);
  const href = entryHref(entry.pdb_id);

  function open(e) {
    if (e.target.closest("a, .card_more")) return;
    go(href);
  }

  return (
    <article className={more ? "result_card show_more" : "result_card"} data-id={entry.pdb_id} onClick={open}>
      <div className="card_picture" aria-hidden="true"></div>
      <div className="card_head">
        <h3 className="card_id">
          <Link to={href}>{entry.pdb_id}</Link>
          {entry.polymer_type && <> <span className="card_badge">{entry.polymer_type}</span></>}
        </h3>
        <p className="card_title">{entry.title}</p>
        <p className="card_when">{p.when}</p>
      </div>
      <dl className="card_facts">
        {p.facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{typeof value === "string" ? value : <>{value.n} <small>({value.wc} WC)</small></>}</dd>
          </div>
        ))}
      </dl>
      <div className="card_brief">
        {p.nums.length > 0 && (
          <div className="card_nums">
            {p.nums.map(([label, n]) => <div key={label}><b>{n}</b><span>{label}</span></div>)}
          </div>
        )}
        {p.brief && <p className="card_cite">{p.brief}</p>}
        {(p.residues.length > 0 || p.ligandChip) && (
          <p className="card_chips">
            {p.residues.map((r) => <span className="card_chip" key={r}>{r}</span>)}
            {p.ligandChip && <span className="card_chip card_chip_dim">{p.ligandChip}</span>}
          </p>
        )}
        <div className="card_actions">
          <button type="button" className="card_more" aria-expanded={more} onClick={() => setMore(!more)}>
            <span>{more ? "Less" : "More"}</span> <i className="arrow" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div className="card_rest">
        {p.rows.map((row) => (
          <div className={row.searched ? "card_field searched" : "card_field"} data-key={row.key} key={row.key}>
            <div className="card_label">{row.label}</div>
            <div className="card_value">{row.value}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default ResultCard;
