import { LETTER } from "../logo.js";

// The landing title (landing.ejs): the rail's five letters set on one line.
// In the rail the 3, D and B sit on a second row, smaller; here each letter is
// moved (and the second row scaled up) so all five stand side by side.
const WORDMARK = [
  { letter: "N", move: "translate(-1237.0,-591.9) scale(1.00009)" },
  { letter: "A", move: "translate(-1235.9,-591.9) scale(1.00009)" },
  { letter: "THREE", move: "translate(-146.4,-2320.3) scale(1.46733)" },
  { letter: "D", move: "translate(-150.5,-2320.3) scale(1.46733)" },
  { letter: "B", move: "translate(-150.5,-2320.3) scale(1.46733)" },
];

function Hero() {
  return (
    <>
      <h1 className="landing_title">
        <svg className="landing_wordmark" viewBox="0 0 3818 881" role="img" aria-label="NA3DB">
          {WORDMARK.map((w) => (
            <g transform={w.move} key={w.letter}><path className="mark_word" d={LETTER[w.letter]} /></g>
          ))}
        </svg>
      </h1>
      <p className="landing_tagline">Nucleic Acid 3D Database</p>

      {/* A plain GET form: the box works before any script runs, and
          submitting lands on a real, shareable /search?q= address. */}
      <form className="landing_search" action="/search" method="get">
        <div className="landing_field">
          {/* Once a row is ticked (Phase 4): what is ticked, and the way to
              drop it, standing where the invitation to type stands. */}
          <div className="picked_line" hidden>
            <p className="pick_what"></p>
            <button type="button" className="pick_clear">Clear</button>
          </div>
          <input type="text" name="q" autoFocus autoComplete="off"
                 placeholder="Search an id, molecule, author or organism" />
          {/* How many structures the ticked rows find (Phase 4). */}
          <p className="pick_count" aria-live="polite"></p>
        </div>
        <button type="submit">Search</button>
      </form>

      {/* Filled with a live count as you type in Phase 6. Empty but always
          in the flow, so the cards below never jump when a number appears. */}
      <p className="landing_count"></p>
    </>
  );
}

export default Hero;
