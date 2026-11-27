import { useEffect } from "react";
import ErrorPage from "./ErrorPage.jsx";
import { UNWRITTEN_MESSAGE } from "../constants.js";

function UnwrittenPage({ heading }) {
  useEffect(() => {
    document.title = `NA3DB · ${heading}`;
  }, [heading]);
  return <ErrorPage heading={heading} message={UNWRITTEN_MESSAGE} />;
}

export default UnwrittenPage;
