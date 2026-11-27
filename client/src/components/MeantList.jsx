import { Fragment } from "react";
import { number, listJoin } from "../format.js";

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
