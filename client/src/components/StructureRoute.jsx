import { useLocation, useOutletContext, useParams } from "react-router";
import StructurePage from "./StructurePage.jsx";

// /structure/:id: the id from the address. Keyed by it, so another entry
// starts as a new page (its views, folds and place), as a full load did.
function StructureRoute() {
  const { id } = useParams();
  const { onFailed } = useOutletContext();
  // Which arc view Base pairs draws (?assembly=): a new one redraws only that.
  const assembly = new URLSearchParams(useLocation().search).get("assembly") ?? "";
  return <StructurePage key={id} id={id} assembly={assembly} onFailed={onFailed} />;
}

export default StructureRoute;
