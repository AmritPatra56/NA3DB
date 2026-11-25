import { useApi } from "../hooks/useApi.js";
import { number } from "../format.js";

// JSON has no Date type, so "updated" arrives as an ISO string (or null).
const DATE_FORMAT = { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Prague" };

// The size of the database under the cards. Only this line uses the numbers,
// so it asks for them itself; until they arrive, or if they never do, the
// line stays empty rather than showing a wrong number.
function Stats() {
  const { data: stats } = useApi("/api/stats");
  if (!stats) return <p className="landing_stats"></p>;
  return (
    <p className="landing_stats">
      <b>{number(stats.total)}</b> structures
      {stats.updated && <> · updated {new Date(stats.updated).toLocaleDateString("en-GB", DATE_FORMAT)}</>}
    </p>
  );
}

export default Stats;
