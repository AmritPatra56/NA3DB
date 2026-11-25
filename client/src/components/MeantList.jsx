import { Fragment } from "react";
import { number, listJoin } from "../format.js";

// "Did you mean a (12), b (3) or c (1)?": the close searches the server sent,
// as the landing count, the top box's count and No entries found all write
// them. Each name is drawn by the caller (a link or a button).
// suggestions: [{ field, value, total }]. renderItem(s): the name.
function MeantList({ suggestions, renderItem }) {
  return (
    <>
      Did you mean{" "}
      {suggestions.map((s, i) => (
        <Fragment key={s.field + "\n" + s.value}>
          {listJoin(i, suggestions.length)}
          {renderItem(s)}
          {` (${number(s.total)})`}
        </Fragment>
      ))}
      ?
    </>
  );
}

export default MeantList;
