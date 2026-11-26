import Landing from "./components/Landing.jsx";
import SearchPage from "./components/SearchPage.jsx";
import StructureRoute from "./components/StructureRoute.jsx";
import UnwrittenPage from "./components/UnwrittenPage.jsx";
import { UNWRITTEN } from "./constants.js";

// The pages App draws, by address (server.js's page routes). /report shows
// the landing page until 8.8 builds it (with no search App sends it to
// /search first), and so does any other address until 8.9's Page not found.
export const routes = [
  { path: "/", element: <Landing /> },
  { path: "/search", element: <SearchPage /> },
  { path: "/structure/:id", element: <StructureRoute /> },
  { path: "/report", element: <Landing /> },
  ...Object.entries(UNWRITTEN).map(([path, heading]) => ({ path: "/" + path, element: <UnwrittenPage heading={heading} /> })),
  { path: "*", element: <Landing /> },
];
