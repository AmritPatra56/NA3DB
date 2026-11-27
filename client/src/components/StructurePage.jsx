import { useEffect } from "react";
import Structure from "./Structure.jsx";
import ErrorPage from "./ErrorPage.jsx";
import { useApi } from "../hooks/useApi.js";
import { errorHeading, failureOf } from "../api.js";
import { here } from "../address.js";

function StructurePage({ id, assembly, expanded, onFailed }) {
  const path = "/api/entries/" + encodeURIComponent(id);
  const entry = useApi(path);
  const molecules = useApi(path + "/molecules");
  const pairs = useApi(`${path}/pairs?assembly=${encodeURIComponent(assembly)}`);
  const help = useApi("/api/help");
  const pairsData = pairs.data ?? pairs.stale;
  const error = entry.error ?? molecules.error ?? pairs.error;
  const failed = Boolean(error);
  useEffect(() => {
    onFailed(failed);
  }, [failed, onFailed]);

  const title = error ? errorHeading(error) : entry.data?.pdb_id ?? id.toUpperCase();
  useEffect(() => {
    document.title = `NA3DB · ${title}`;
  }, [title]);

  if (error) {
    const { heading, message } = failureOf(error, here().path + here().search);
    return <ErrorPage heading={heading} message={message} />;
  }
  if (entry.data && molecules.data && pairsData) return <Structure entry={entry.data} molecules={molecules.data} pairs={pairsData} expanded={expanded} help={help.data} />;

  return (
    <div className="results_area">
      <div className="results_area_header">
        <h1>{title}</h1>
      </div>
      <div className="results_area_body">
        <p className="browse_hint">Loading {title}…</p>
      </div>
    </div>
  );
}

export default StructurePage;
