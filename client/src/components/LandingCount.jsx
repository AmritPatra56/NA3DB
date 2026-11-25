import { Fragment } from "react";
import { number } from "../format.js";

// The line under the box: how many structures the typed text finds
// (landing.js). Nothing found: close searches as links, never applied for
// the reader. Always in the flow, empty or not, so the cards never jump.
function LandingCount({ result }) {
  if (!result) return <p className="landing_count"></p>;
  const { total, suggestions = [] } = result;
  if (total > 0) return <p className="landing_count">{total === 1 ? "1 structure" : `${number(total)} structures`}</p>;

  return (
    <p className="landing_count">
      no structures match
      {suggestions.length > 0 && <>
        . Did you mean {suggestions.map((s, i) => (
          <Fragment key={s.value}>
            {i > 0 && (i === suggestions.length - 1 ? " or " : ", ")}
            <a href={"/search?q=" + encodeURIComponent(s.value)}>{s.value}</a> ({number(s.total)})
          </Fragment>
        ))}?
      </>}
    </p>
  );
}

export default LandingCount;
