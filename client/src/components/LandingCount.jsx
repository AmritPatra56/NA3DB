import MeantList from "./MeantList.jsx";
import { structures } from "../format.js";

// The line under the box: how many structures the typed text finds
// (landing.js). Nothing found: close searches as links, never applied for
// the reader. Always in the flow, empty or not, so the cards never jump.
function LandingCount({ result }) {
  if (!result) return <p className="landing_count"></p>;
  const { total, suggestions = [] } = result;
  if (total > 0) return <p className="landing_count">{structures(total)}</p>;

  return (
    <p className="landing_count">
      no structures match
      {suggestions.length > 0 && <>
        {". "}
        <MeantList suggestions={suggestions} renderItem={(s) => (
          <a href={"/search?q=" + encodeURIComponent(s.value)}>{s.value}</a>
        )} />
      </>}
    </p>
  );
}

export default LandingCount;
