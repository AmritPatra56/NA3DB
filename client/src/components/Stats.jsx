import stats from "../data/stats.json";

// JSON has no Date type, so "updated" arrives as an ISO string (or null).
const DATE_FORMAT = { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Prague" };

function Stats() {
  return (
    <p className="landing_stats">
      <b>{stats.total.toLocaleString("en-GB")}</b> structures
      {stats.updated && <> · updated {new Date(stats.updated).toLocaleDateString("en-GB", DATE_FORMAT)}</>}
    </p>
  );
}

export default Stats;
