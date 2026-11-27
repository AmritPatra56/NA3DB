import { useEffect } from "react";
import { useLocation } from "react-router";
import ErrorPage from "./ErrorPage.jsx";

function NotFoundPage() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    document.title = "NA3DB · Page not found";
  }, []);
  return <ErrorPage heading="Page not found" message={`There is nothing at ${pathname + search}.`} />;
}

export default NotFoundPage;
