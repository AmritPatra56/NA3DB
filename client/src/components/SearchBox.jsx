import PickedLine from "./PickedLine.jsx";

const INVITE = "Search an id, molecule, author or organism";

// The landing search box. Landing owns the text and the picks; the box shows
// them and reports typing, Clear and Search back up.
// A plain GET form: with nothing picked it submits as /search?q=, a real,
// shareable address. onSearch takes over only while rows are answered.
function SearchBox({ text, onText, summary, onClear, onSearch }) {
  return (
    <form className="landing_search" action="/search" method="get" onSubmit={onSearch}>
      <div className="landing_field">
        <PickedLine summary={summary} onClear={onClear} />
        {/* While rows are answered the picks stand in for the invitation. */}
        <input type="text" name="q" autoFocus autoComplete="off"
               placeholder={summary ? "" : INVITE}
               value={text} onChange={(e) => onText(e.target.value)} />
        {/* How many structures the picks find (6.4). */}
        <p className="pick_count" aria-live="polite"></p>
      </div>
      <button type="submit">Search</button>
    </form>
  );
}

export default SearchBox;
