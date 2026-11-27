import { useLocation, useOutletContext, useParams } from "react-router";
import StructurePage from "./StructurePage.jsx";

function StructureRoute() {
  const { id } = useParams();
  const { onFailed } = useOutletContext();
  const location = useLocation();
  const assembly = new URLSearchParams(location.search).get("assembly") ?? "";
  const expanded = location.state ?? null;
  return <StructurePage key={id} id={id} assembly={assembly} expanded={expanded} onFailed={onFailed} />;
}

export default StructureRoute;
