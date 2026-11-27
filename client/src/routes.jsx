import Landing from "./components/Landing.jsx";
import SearchPage from "./components/SearchPage.jsx";
import StructureRoute from "./components/StructureRoute.jsx";
import UnwrittenPage from "./components/UnwrittenPage.jsx";
import ReportPage from "./components/ReportPage.jsx";
import NotFoundPage from "./components/NotFoundPage.jsx";
import { UNWRITTEN } from "./constants.js";

export const routes = [
  { path: "/", element: <Landing /> },
  { path: "/search", element: <SearchPage /> },
  { path: "/structure/:id", element: <StructureRoute /> },
  { path: "/report", element: <ReportPage /> },
  ...Object.entries(UNWRITTEN).map(([path, heading]) => ({ path: "/" + path, element: <UnwrittenPage heading={heading} /> })),
  { path: "*", element: <NotFoundPage /> },
];
