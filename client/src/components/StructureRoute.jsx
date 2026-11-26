import { useOutletContext, useParams } from "react-router";
import StructurePage from "./StructurePage.jsx";

// /structure/:id: the id from the address. Keyed by it, so another entry
// starts as a new page (its views, folds and place), as a full load did.
function StructureRoute() {
  const { id } = useParams();
  const { onFailed } = useOutletContext();
  return <StructurePage key={id} id={id} onFailed={onFailed} />;
}

export default StructureRoute;
