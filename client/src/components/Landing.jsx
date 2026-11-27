import { Link, useOutletContext } from "react-router";
import { useEffect, useState } from "react";
import Hero from "./Hero.jsx";
import SearchBox from "./SearchBox.jsx";
import LandingCount from "./LandingCount.jsx";
import BrowseCard from "./BrowseCard.jsx";
import Stats from "./Stats.jsx";
import ErrorPage from "./ErrorPage.jsx";
import { useApi } from "../hooks/useApi.js";
import { failureOf } from "../api.js";
import { answerRow, toggleTick, picksOf } from "../answers.js";
import { pickSummary, pickUrl, pickWords } from "../pick.js";
import { searchable } from "../query.js";
import { go } from "../address.js";
import { COUNT_SETTLE_MS } from "../constants.js";

const FULL = "/search?panel=open";

function Landing() {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState({});
  const cards = useApi("/api/browse");
  const stats = useApi("/api/stats");
  const error = cards.error ?? stats.error;
  const failed = Boolean(error);
  const { onFailed } = useOutletContext();
  useEffect(() => {
    onFailed(failed);
  }, [failed, onFailed]);

  const failure = error && failureOf(error, "/");
  const title = failure ? `NA3DB · ${failure.heading}` : "NA3DB";
  useEffect(() => {
    document.title = title;
  }, [title]);

  const typed = text.trim();
  const picks = picksOf(cards.data ?? [], answers);
  const summary = picks.length ? pickSummary(picks, typed) : "";

  const typedCount = useApi(searchable(typed) ? "/api/count?q=" + encodeURIComponent(typed) : null, COUNT_SETTLE_MS);
  const pickCount = useApi(picks.length ? "/api/count?" + pickUrl("", typed, picks) : null, COUNT_SETTLE_MS);
  const pickTotal = pickCount.data?.total;

  const answer = (label, target) => setAnswers((prev) => answerRow(prev, label, target));
  const tick = (label, option) => setAnswers((prev) => toggleTick(prev, label, option));
  const toSearch = (query) => go("/search?" + query);

  const search = (e) => {
    e.preventDefault();
    toSearch(picks.length ? pickUrl("", typed, picks) : new URLSearchParams(new FormData(e.currentTarget)).toString());
  };

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

  if (failure) return <ErrorPage heading={failure.heading} message={failure.message} />;
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
          <div className="browse picking">
            {cards.data?.map((card) => (
              <BrowseCard key={card.area} card={card} answers={answers}
                          onAnswer={answer} onTick={tick} />
            ))}
          </div>

          <Link className="download download_quiet landing_advanced"
                to={picks.length ? FULL + "&" + pickUrl("", "", picks) : FULL}>Full search</Link>

          <Stats stats={stats.data} />
        </div>
      </div>
    </div>
  );
}

export default Landing;
