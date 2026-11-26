import { Fragment } from "react";
import { HINT, columnKey, pairKey } from "../lbn.js";

// The words under the 1D lines: the nucleotide on show and what it pairs
// with. A partner whose pair the table lists links to its row, and a pair
// shown from the table can be gone back to (back: its row). tableRows: the
// table's rows by pair (lbn.js rowsByPair). infoRef: the line, to scroll to.
function LbnInfo({ infoRef, map, shown, words, back, missing, tableRows, onFindRow }) {
  const find = (row) => (e) => {
    e.preventDefault();
    onFindRow(row);
  };
  let body = HINT;
  if (missing) body = "This pair is not in the 1D view.";
  else if (words) {
    body = (
      <>
        {words.head} · {words.items.length ? "pairs with " : "not paired"}
        {/* A column's partners, in the order its rows list them: fixed for this map. */}
        {words.items.map((p, n) => {
          const row = tableRows.get(pairKey(columnKey(map, shown), columnKey(map, p.col)));
          return (
            <Fragment key={n}>
              {n > 0 && ", "}
              {row ? <a href="#bp-all" className="lbn_find" title="Find this pair in the Base pairs table" onClick={find(row)}>{p.text}</a> : p.text}
            </Fragment>
          );
        })}
        {back && <> · <a href="#bp-all" className="lbn_find" onClick={find(back)}>Back to the table</a></>}
      </>
    );
  }
  return <p ref={infoRef} className="lbn_info" aria-live="polite">{body}</p>;
}

export default LbnInfo;
