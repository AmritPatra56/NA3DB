import PickedLine from "./PickedLine.jsx";
import SuggestList from "./SuggestList.jsx";
import { useBoxSuggest } from "../hooks/useBoxSuggest.js";

const INVITE = "Search an id, molecule, author or organism";

// The landing search box. Landing owns the text and the picks; the box shows
// them and reports typing, Clear, Search and a picked name back up. The name
// list is the box's own (useBoxSuggest).
// A plain GET form: with nothing picked it submits as /search?q=, a real,
// shareable address. onSearch takes over only while rows are answered.
function SearchBox({ text, onText, summary, count, blocked, onClear, onSearch, onPick }) {
  const names = useBoxSuggest(text, (t) => "/api/box_suggestions?q=" + encodeURIComponent(t), onPick);

  return (
    <form className="landing_search" action="/search" method="get"
          onSubmit={(e) => { names.close(); onSearch(e); }}>
      <div className="landing_field">
        <PickedLine summary={summary} onClear={onClear} />
        {/* While rows are answered the picks stand in for the invitation. */}
        <input type="text" name="q" autoFocus autoComplete="off"
               placeholder={summary ? "" : INVITE}
               {...names.input}
               value={text}
               onChange={(e) => { names.typed(e); onText(e.target.value); }} />
        {/* How many structures the picks find, inside the box it belongs to. */}
        <p className="pick_count" aria-live="polite">{count}</p>
        <SuggestList {...names.list} />
      </div>
      <button type="submit" disabled={blocked}>Search</button>
    </form>
  );
}

export default SearchBox;
