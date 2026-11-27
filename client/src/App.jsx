import { useCallback, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import Rail from "./components/Rail.jsx";
import Footer from "./components/Footer.jsx";
import { routeOf, railOf, redirectOf } from "./route.js";

function App() {
  const { pathname, search } = useLocation();
  const [failedAt, setFailedAt] = useState(null);
  const onFailed = useCallback((failed) => setFailedAt(failed ? pathname : null), [pathname]);

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
