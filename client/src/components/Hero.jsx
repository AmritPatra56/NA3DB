import { LETTER } from "../logo.js";

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
    </>
  );
}

export default Hero;
