import PickedLine from "./PickedLine.jsx";
import SuggestList from "./SuggestList.jsx";
import { useBoxSuggest } from "../hooks/useBoxSuggest.js";
import { BOX_PLACEHOLDER } from "../constants.js";

function SearchBox({ text, onText, summary, count, blocked, onClear, onSearch, onPick }) {
  const names = useBoxSuggest(text, (t) => "/api/box_suggestions?q=" + encodeURIComponent(t), onPick);

  return (
    <form className="landing_search" action="/search" method="get"
          onSubmit={(e) => { names.close(); onSearch(e); }}>
      <div className="landing_field">
        <PickedLine summary={summary} onClear={onClear} />
        <input type="text" name="q" autoFocus autoComplete="off"
               placeholder={summary ? "" : BOX_PLACEHOLDER}
               {...names.input}
               value={text}
               onChange={(e) => { names.typed(e); onText(e.target.value); }} />
        <p className="pick_count" aria-live="polite">{count}</p>
        <SuggestList {...names.list} />
      </div>
      <button type="submit" disabled={blocked}>Search</button>
    </form>
  );
}

export default SearchBox;
