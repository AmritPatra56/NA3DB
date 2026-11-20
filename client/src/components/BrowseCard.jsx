import BrowseRow from "./BrowseRow.jsx";

function BrowseCard({ area, question, hint, rows, foot }) {
  return (
    <section className="browse_card" style={{ gridArea: area }}>
      <h2>{question}</h2>
      <p className="browse_hint">{hint}</p>
      <ul className="browse_rows">
        {rows.map((row) => (
          <BrowseRow key={row.label} row={row} />
        ))}
      </ul>
      {foot && <p className="browse_foot">{foot.text}</p>}
    </section>
  );
}

export default BrowseCard;
