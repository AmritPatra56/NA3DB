import Hero from "./Hero.jsx";
import BrowseCard from "./BrowseCard.jsx";
import Stats from "./Stats.jsx";
import browse from "../data/browse.json";

function Landing() {
  return (
    <div className="landing_page">
      <div className="landing">
        <div className="landing_inner">
          <Hero />
          <p className="browse_lead">Not sure what to type? Start from what you know.</p>
          {/* One grid: each card places itself by its grid area (style.css), so
              the order here is just the order of browse.json (filters.js BROWSE).
              picking: the rows answer Yes and No here instead of following their links. */}
          <div className="browse picking">
            {browse.map((card) => (
              <BrowseCard key={card.area} area={card.area} question={card.question}
                          hint={card.hint} rows={card.rows} foot={card.foot} />
            ))}
          </div>

          <a className="download download_quiet landing_advanced" href="/search?panel=open">Full search</a>

          <Stats />
        </div>
      </div>
    </div>
  );
}

export default Landing;
