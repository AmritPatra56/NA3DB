import { useEffect } from "react";
import Structure from "./Structure.jsx";
import ErrorPage from "./ErrorPage.jsx";
import { useApi } from "../hooks/useApi.js";
import { errorHeading } from "../api.js";
import { here } from "../address.js";

// /structure/:id: asks the server for the entry, its molecules and its pairs
// (the arc picture as ?assembly= picks it), says so
// while they come, and hands them to Structure, which only draws.
//
// StructurePage   (fetches, owns nothing else)
// ├─ ErrorPage    when the entry is missing or the server fails
// └─ Structure    (owns the page's folds and where the reader is)
//    ├─ SectionNav
//    └─ Section ×n → Views, Overview, Molecules, ...
// onFailed(failed): whether the page shows an error, so the rail can be the
// error page's (server.js renders it with page "none").
function StructurePage({ id, assembly, expanded, onFailed }) {
  const path = "/api/entries/" + encodeURIComponent(id);
  const entry = useApi(path);
  const molecules = useApi(path + "/molecules");
  const pairs = useApi(`${path}/pairs?assembly=${encodeURIComponent(assembly)}`);
  // The "?" notes: the page draws without them until they come.
  const help = useApi("/api/help");
  // Another assembly keeps the page drawn, the last picture showing until the new one comes.
  const pairsData = pairs.data ?? pairs.stale;
  const error = entry.error ?? molecules.error ?? pairs.error;
  const failed = Boolean(error);
  useEffect(() => {
    onFailed(failed);
  }, [failed, onFailed]);

  // The tab's title, as the EJS pages write it: the page's one effect on <head>.
  const title = error ? errorHeading(error) : entry.data?.pdb_id ?? id.toUpperCase();
  useEffect(() => {
    document.title = `NA3DB · ${title}`;
  }, [title]);

  if (error) {
    const message = error.status === 404 ? `There is nothing at ${here().path}.` : error.message;
    return <ErrorPage heading={errorHeading(error)} message={message} />;
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
