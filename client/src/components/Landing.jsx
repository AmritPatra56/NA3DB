import Hero from "./Hero.jsx";
import BrowseCard from "./BrowseCard.jsx";
import Stats from "./Stats.jsx";
import browse from "../data/browse.json";

// Three columns of near equal length: the cards hold 6, 5, 3, 1 and 2 rows,
// so they go 6 | 5 + 1 | 3 + 2. Narrower, style.css lets the columns go and
// places each card by its grid area.
const COLUMNS = [["made"], ["from", "modified"], ["method", "bound"]];

function Landing() {
  return (
    <div className="landing_page">
      <div className="landing">
        <div className="landing_inner">
          <Hero />
          <p className="browse_lead">Not sure what to type? Start from what you know.</p>
          {/* picking: the rows answer Yes and No here instead of following their links (style.css). */}
          <div className="browse picking">
            {COLUMNS.map((column) => (
              <div className="browse_column" key={column.join("+")}>
                {column
                  .map((area) => browse.find((card) => card.area === area))
                  .filter(Boolean)
                  .map((card) => (
                    <BrowseCard key={card.area} area={card.area} question={card.question}
                                hint={card.hint} rows={card.rows} foot={card.foot} />
                  ))}
              </div>
            ))}
          </div>

          <Stats />
        </div>
      </div>
    </div>
  );
}

export default Landing;
