import { useState } from "react";
import PickedLine from "./PickedLine.jsx";
import SuggestList from "./SuggestList.jsx";
import { useApi } from "../hooks/useApi.js";
import { suggestable } from "../query.js";
import { LIST_ID, optionId, nextActive } from "../suggest.js";

const INVITE = "Search an id, molecule, author or organism";
// box_suggest.js: short enough to keep up, long enough that a typed word is one request.
const SUGGEST_MS = 150;

// Exactly under the box, as wide as it, whatever sits beside it.
const under = (input) => ({ left: `${input.offsetLeft}px`, top: `${input.offsetTop + input.offsetHeight + 4}px`,
                            width: `${input.offsetWidth}px` });

// The landing search box. Landing owns the text and the picks; the box shows
// them and reports typing, Clear, Search and a picked name back up.
// The name list is the box's own business, so its state lives here: whether
// the box has focus, which name the arrows are on, and where the list sits.
// A plain GET form: with nothing picked it submits as /search?q=, a real,
// shareable address. onSearch takes over only while rows are answered.
function SearchBox({ text, onText, summary, count, blocked, onClear, onSearch, onPick }) {
  const [focused, setFocused] = useState(false);
  // The text the list was closed for (Escape, a pick, Search). Typing on opens it again.
  const [closedFor, setClosedFor] = useState(null);
  const [active, setActive] = useState({ for: null, at: -1 });
  const [place, setPlace] = useState(undefined);

  const typed = text.trim();
  const wanted = focused && suggestable(typed) ? typed : null;
  const { data: reply } = useApi(wanted === null ? null : "/api/box_suggestions?q=" + encodeURIComponent(wanted), SUGGEST_MS);
  const items = reply?.groups.flatMap((g) => g.items) ?? [];
  const open = wanted !== null && reply?.text === wanted && items.length > 0 && closedFor !== wanted;
  const at = open && active.for === wanted ? active.at : -1;

  const pick = (item) => {
    setClosedFor(item.filter ? "" : item.value);
    onPick(item);
  };

  function handleKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive({ for: wanted, at: nextActive(e.key, at, items.length) });
    } else if (e.key === "Enter" && at >= 0) {
      e.preventDefault();
      pick(items[at]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setClosedFor(wanted);
    }
  }

  return (
    <form className="landing_search" action="/search" method="get"
          onSubmit={(e) => { setClosedFor(wanted); onSearch(e); }}>
      <div className="landing_field">
        <PickedLine summary={summary} onClear={onClear} />
        {/* While rows are answered the picks stand in for the invitation. */}
        <input type="text" name="q" autoFocus autoComplete="off"
               placeholder={summary ? "" : INVITE}
               role="combobox" aria-autocomplete="list" aria-controls={LIST_ID} aria-expanded={open}
               aria-activedescendant={at >= 0 ? optionId(at) : undefined}
               value={text}
               onChange={(e) => { setPlace(under(e.target)); setClosedFor(null); onText(e.target.value); }}
               onFocus={(e) => { setPlace(under(e.target)); setClosedFor(null); setFocused(true); }}
               onBlur={() => setFocused(false)}
               onKeyDown={handleKeyDown} />
        {/* How many structures the picks find, inside the box it belongs to. */}
        <p className="pick_count" aria-live="polite">{count}</p>
        <SuggestList reply={reply} open={open} active={at} place={place} onPick={pick} />
      </div>
      <button type="submit" disabled={blocked}>Search</button>
    </form>
  );
}

export default SearchBox;
