import { Fragment } from "react";
import { number } from "../format.js";

// Under No entries found: searches the server found close to what was typed,
// each a real link with the count it gives (update_empty_state). Never
// applied without a click; a plain click searches in place, a ctrl-click or
// middle click opens the link as usual.
// hrefOf(s): the link's address. onPick(s): search it here.
function DidYouMean({ suggestions, hrefOf, onPick }) {
  if (suggestions.length === 0) return <p className="did_you_mean hidden"></p>;

  function pick(e, s) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onPick(s);
  }

  return (
    <p className="did_you_mean">
      Did you mean{" "}
      {suggestions.map((s, i) => (
        <Fragment key={s.field + s.value}>
          {i > 0 && (i === suggestions.length - 1 ? " or " : ", ")}
          <a href={hrefOf(s)} data-field={s.field} data-value={s.value} onClick={(e) => pick(e, s)}>{s.value}</a>
          {` (${number(s.total)})`}
        </Fragment>
      ))}
      ?
    </p>
  );
}

export default DidYouMean;
