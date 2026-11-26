import { useEffect } from "react";
import ErrorPage from "./ErrorPage.jsx";
import { UNWRITTEN_MESSAGE } from "../constants.js";

// A footer page linked before it is written (server.js UNWRITTEN): its
// heading and the line that says so, on the error page.
function UnwrittenPage({ heading }) {
  useEffect(() => {
    document.title = `NA3DB · ${heading}`;
  }, [heading]);
  return <ErrorPage heading={heading} message={UNWRITTEN_MESSAGE} />;
}

export default UnwrittenPage;
