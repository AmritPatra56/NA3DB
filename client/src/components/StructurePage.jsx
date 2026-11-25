import { useEffect } from "react";
import Structure from "./Structure.jsx";
import ErrorPage from "./ErrorPage.jsx";
import { useApi } from "../hooks/useApi.js";
import { errorHeading } from "../api.js";

// /structure/:id: asks the server for the entry and its molecules, says so
// while they come, and hands them to Structure, which only draws.
//
// StructurePage   (fetches, owns nothing else)
// ├─ ErrorPage    when the entry is missing or the server fails
// └─ Structure    (owns the page's folds and where the reader is)
//    ├─ SectionNav
//    └─ Section ×n → Views, Overview, Molecules, ...
function StructurePage({ id }) {
  const path = "/api/entries/" + encodeURIComponent(id);
  const entry = useApi(path);
  const molecules = useApi(path + "/molecules");
  const error = entry.error ?? molecules.error;

  // The tab's title, as the EJS pages write it: the page's one effect on <head>.
  const title = error ? errorHeading(error) : entry.data?.pdb_id ?? id.toUpperCase();
  useEffect(() => {
    document.title = `NA3DB · ${title}`;
  }, [title]);

  if (error) {
    const message = error.status === 404 ? `There is nothing at ${window.location.pathname}.` : error.message;
    return <ErrorPage heading={errorHeading(error)} message={message} />;
  }
  if (entry.data && molecules.data) return <Structure entry={entry.data} molecules={molecules.data} />;

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
