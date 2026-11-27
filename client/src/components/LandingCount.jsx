import { Link } from "react-router";
import MeantList from "./MeantList.jsx";
import { structures } from "../format.js";

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
          <Link to={"/search?q=" + encodeURIComponent(s.value)}>{s.value}</Link>
        )} />
      </>}
    </p>
  );
}

export default LandingCount;
