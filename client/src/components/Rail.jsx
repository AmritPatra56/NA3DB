import { Link } from "react-router";
import ThemeButton from "./ThemeButton.jsx";
import { MARK_LIGHT, MARK_DEEP, LETTER } from "../logo.js";

function Rail({ active, report, carry }) {
  const item = (name) => `rail-item ${active === name ? "active" : ""}`;
  return (
    <div className="rail">
      <div className="rail-icons">
        <Link to="/" className="rail-logo" title="NA3DB home" aria-label="NA3DB home">
            <svg className="mark" viewBox="0 0 2705 2774" aria-hidden="true">
              {MARK_LIGHT.map((d) => <path className="mark_light" d={d} key={d} />)}
              {MARK_DEEP.map((d) => <path className="mark_deep" d={d} key={d} />)}
              {["N", "A", "D", "B", "THREE"].map((l) => <path className="mark_word" d={LETTER[l]} key={l} />)}
            </svg>
        </Link>
        <Link to={"/search" + carry} className={item("search")} data-page="/search" title="Full search" aria-label="Full search">
          <img src="/assets/search.svg" alt="Search" />
        </Link>
        <a href="#" className="rail-item" title="Questions">
          <img src="/assets/Q.png" alt="Questions" className="icon-narrow" />
        </a>
        {report && (
          <Link to={"/report" + carry} className={item("report")} data-page="/report" title="Report">
            <img src="/assets/report.svg" alt="Report" />
          </Link>
        )}
      </div>
      <ThemeButton />
    </div>
  );
}

export default Rail;
