import { useState } from "react";
import Hero from "./Hero.jsx";
import SearchBox from "./SearchBox.jsx";
import BrowseCard from "./BrowseCard.jsx";
import Stats from "./Stats.jsx";
import browse from "../data/browse.json";
import { answerRow, toggleTick, picksOf } from "../answers.js";
import { pickSummary, pickUrl } from "../pick.js";

const FULL = "/search?panel=open";

// The one owner of the landing's state: what is typed and how each row is
// answered. Everything below only shows what it is given and calls back up.
//
// Landing
// ├─ Hero          the title
// ├─ SearchBox     text, picked line, Search     (reads text and picks)
// │  └─ PickedLine
// ├─ BrowseCard ×5                               (reads answers)
// │  └─ BrowseRow → BrowseOption
// ├─ Full search                                 (reads picks)
// └─ Stats
function Landing() {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState({});

  // Worked out from state on every render, never stored twice.
  const typed = text.trim();
  const picks = picksOf(browse, answers);
  const summary = picks.length ? pickSummary(picks, typed) : "";

  const answer = (label, target) => setAnswers((prev) => answerRow(prev, label, target));
  const tick = (label, option) => setAnswers((prev) => toggleTick(prev, label, option));

  // With nothing picked the form goes on as the plain GET it is.
  const search = (e) => {
    if (picks.length === 0) return;
    e.preventDefault();
    window.location.href = "/search?" + pickUrl("", typed, picks);
  };

  return (
    <div className={picks.length ? "landing_page picked" : "landing_page"}>
      <div className="landing">
        <div className="landing_inner">
          <Hero />
          <SearchBox text={text} onText={setText} summary={summary}
                     onClear={() => setAnswers({})} onSearch={search} />
          {/* Filled with a live count as you type in Phase 6. Empty but always
              in the flow, so the cards below never jump when a number appears. */}
          <p className="landing_count"></p>

          <p className="browse_lead">Not sure what to type? Start from what you know.</p>
          {/* One grid: each card places itself by its grid area (style.css), so
              the order here is just the order of browse.json (filters.js BROWSE).
              picking: the rows answer Yes and No here instead of following their links. */}
          <div className="browse picking">
            {browse.map((card) => (
              <BrowseCard key={card.area} card={card} answers={answers}
                          onAnswer={answer} onTick={tick} />
            ))}
          </div>

          <a className="download download_quiet landing_advanced"
             href={picks.length ? FULL + "&" + pickUrl("", "", picks) : FULL}>Full search</a>

          <Stats />
        </div>
      </div>
    </div>
  );
}

export default Landing;
