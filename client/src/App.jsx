import { useCallback, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import Rail from "./components/Rail.jsx";
import Footer from "./components/Footer.jsx";
import { routeOf, railOf, redirectOf } from "./route.js";

// Round every page: the rail and the footer, with the page the address picks
// (routes.jsx) in between. It reads the address on every move, so the rail
// lights and carries what the page in view needs.
function App() {
  const { pathname, search } = useLocation();
  // The page that shows an error instead (error.ejs): only while it is in view.
  const [failedAt, setFailedAt] = useState(null);
  const onFailed = useCallback((failed) => setFailedAt(failed ? pathname : null), [pathname]);

  // An address the server would send elsewhere goes there first, in place.
  const to = redirectOf(pathname, search);
  if (to) return <Navigate to={to} replace />;

  const route = failedAt === pathname ? { name: "error" } : routeOf(pathname);
  return (
    <>
      <div className="interface">
        <Rail {...railOf(route, search)} />
        <Outlet context={{ onFailed }} />
      </div>
      <Footer />
    </>
  );
}

export default App;
