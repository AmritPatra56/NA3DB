import stats from "../data/stats.json";
import { number } from "../format.js";

// JSON has no Date type, so "updated" arrives as an ISO string (or null).
const DATE_FORMAT = { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Prague" };

function Stats() {
  return (
    <p className="landing_stats">
      <b>{number(stats.total)}</b> structures
      {stats.updated && <> · updated {new Date(stats.updated).toLocaleDateString("en-GB", DATE_FORMAT)}</>}
    </p>
  );
}

export default Stats;
