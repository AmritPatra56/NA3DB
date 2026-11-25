import { useState } from "react";
import Hero from "./Hero.jsx";
import SearchBox from "./SearchBox.jsx";
import LandingCount from "./LandingCount.jsx";
import BrowseCard from "./BrowseCard.jsx";
import Stats from "./Stats.jsx";
import { useApi } from "../hooks/useApi.js";
import { answerRow, toggleTick, picksOf } from "../answers.js";
import { pickSummary, pickUrl, pickWords } from "../pick.js";
import { searchable } from "../query.js";
import { go } from "../address.js";
import { COUNT_SETTLE_MS } from "../constants.js";

const FULL = "/search?panel=open";

// The one owner of the landing's state: what is typed and how each row is
// answered. It asks the server for the cards and the counts; everything
// below only shows what it is given and calls back up.
//
// Landing
// ├─ Hero          the title
// ├─ SearchBox     text, picked line, count, Search   (owns only its name list)
// │  ├─ PickedLine
// │  └─ SuggestList
// ├─ LandingCount  what the typed text finds
// ├─ BrowseCard ×5 → BrowseRow → BrowseOption          (reads answers)
// ├─ Full search                                       (reads picks)
// └─ Stats                                             (asks for its own numbers)
function Landing() {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState({});
  const cards = useApi("/api/browse");

  // Worked out from state on every render, never stored twice.
  const typed = text.trim();
  const picks = picksOf(cards.data ?? [], answers);
  const summary = picks.length ? pickSummary(picks, typed) : "";

  // Two counts, each asked once the typing settles: the typed text alone,
  // and the picks with it. useApi drops an answer to an older question.
  const typedCount = useApi(searchable(typed) ? "/api/count?q=" + encodeURIComponent(typed) : null, COUNT_SETTLE_MS);
  const pickCount = useApi(picks.length ? "/api/count?" + pickUrl("", typed, picks) : null, COUNT_SETTLE_MS);
  const pickTotal = pickCount.data?.total;

  const answer = (label, target) => setAnswers((prev) => answerRow(prev, label, target));
  const tick = (label, option) => setAnswers((prev) => toggleTick(prev, label, option));
  const toSearch = (query) => go("/search?" + query);

  // With nothing picked the form goes on as the plain GET it is.
  const search = (e) => {
    if (picks.length === 0) return;
    e.preventDefault();
    toSearch(pickUrl("", typed, picks));
  };

  // A name picked under the box is that search. An organism, residue or
  // ligand lands in its own filter, keeping any answered rows; the half-typed
  // text it came from is left out.
  const pickName = (item) => {
    if (item.href) {
      go(item.href);
      return;
    }
    setText(item.filter ? "" : item.value);
    if (item.filter) toSearch(picks.length ? pickUrl("", "", picks, { [item.filter]: item.value })
                                           : new URLSearchParams({ [item.filter]: item.value }).toString());
    else toSearch(picks.length ? pickUrl("", item.value, picks) : new URLSearchParams({ q: item.value }).toString());
  };

  return (
    <div className={picks.length ? "landing_page picked" : "landing_page"}>
      <div className="landing">
        <div className="landing_inner">
          <Hero />
          <SearchBox text={text} onText={setText} summary={summary}
                     count={pickTotal === undefined ? "" : pickWords(pickTotal)} blocked={pickTotal === 0}
                     onClear={() => setAnswers({})} onSearch={search} onPick={pickName} />
          <LandingCount result={typedCount.data} />

          <p className="browse_lead">Not sure what to type? Start from what you know.</p>
          {/* One grid: each card places itself by its grid area (style.css), so
              the order here is just the order /api/browse sends (filters.js BROWSE).
              picking: the rows answer Yes and No here instead of following their links. */}
          <div className="browse picking">
            {cards.data?.map((card) => (
              <BrowseCard key={card.area} card={card} answers={answers}
                          onAnswer={answer} onTick={tick} />
            ))}
          </div>
          {/* The box still searches without the cards, so a failure is one quiet line. */}
          {cards.error && <p className="browse_hint">The questions could not be loaded. The search box still works.</p>}

          <a className="download download_quiet landing_advanced"
             href={picks.length ? FULL + "&" + pickUrl("", "", picks) : FULL}>Full search</a>

          <Stats />
        </div>
      </div>
    </div>
  );
}

export default Landing;
