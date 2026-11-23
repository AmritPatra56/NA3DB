import ThemeButton from "./ThemeButton.jsx";
import { MARK_LIGHT, MARK_DEEP, LETTER } from "../logo.js";

function Rail() {
  return (
    <div className="rail">
      <div className="rail-icons">
        <a href="/" className="rail-logo" title="NA3DB home" aria-label="NA3DB home">
            {/* The logo: the mark and the wordmark as one lockup (rail.ejs). The link
                carries the name, so the drawing is hidden from screen readers. The
                colours follow the theme through --mark-deep and --mark-light. */}
            <svg className="mark" viewBox="0 0 2705 2774" aria-hidden="true">
              {MARK_LIGHT.map((d) => <path className="mark_light" d={d} key={d} />)}
              {MARK_DEEP.map((d) => <path className="mark_deep" d={d} key={d} />)}
              {["N", "A", "D", "B", "THREE"].map((l) => <path className="mark_word" d={LETTER[l]} key={l} />)}
            </svg>
        </a>
        <a href="/search" className="rail-item" data-page="/search" title="Full search" aria-label="Full search">
          <img src="/assets/search.svg" alt="Search" />
        </a>
        <a href="#" className="rail-item" title="Questions">
          <img src="/assets/Q.png" alt="Questions" className="icon-narrow" />
        </a>
      </div>
      <ThemeButton />
    </div>
  );
}

export default Rail;
