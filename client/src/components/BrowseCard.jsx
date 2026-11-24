import BrowseRow from "./BrowseRow.jsx";

// One question and its rows. Hands each row its own answer and the callbacks,
// already told which row they are for.
function BrowseCard({ card, answers, onAnswer, onTick }) {
  const { area, question, hint, rows, foot } = card;
  return (
    <section className="browse_card" style={{ gridArea: area }}>
      <h2>{question}</h2>
      <p className="browse_hint">{hint}</p>
      <ul className="browse_rows">
        {rows.map((row) => (
          <BrowseRow key={row.label} row={row}
                     answer={answers[row.label]?.answer ?? "off"}
                     ticked={answers[row.label]?.ticked ?? []}
                     onAnswer={(target) => onAnswer(row.label, target)}
                     onTick={(option) => onTick(row.label, option)} />
        ))}
      </ul>
      {foot && <p className="browse_foot">{foot.text}</p>}
    </section>
  );
}

export default BrowseCard;
