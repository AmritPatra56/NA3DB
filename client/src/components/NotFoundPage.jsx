import { useEffect } from "react";
import { useLocation } from "react-router";
import ErrorPage from "./ErrorPage.jsx";

// An address no page answers (server.js's last app.use): Page not found,
// naming the address as it was asked, query and all.
function NotFoundPage() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    document.title = "NA3DB · Page not found";
  }, []);
  return <ErrorPage heading="Page not found" message={`There is nothing at ${pathname + search}.`} />;
}

export default NotFoundPage;
