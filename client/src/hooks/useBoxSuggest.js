import { useState } from "react";
import { useApi } from "./useApi.js";
import { suggestable } from "../query.js";
import { LIST_ID, optionId, nextActive } from "../suggest.js";
import { SUGGEST_MS } from "../constants.js";

// Exactly under the box, as wide as it, whatever sits beside it.
const under = (input) => ({ left: `${input.offsetLeft}px`, top: `${input.offsetTop + input.offsetHeight + 4}px`,
                            width: `${input.offsetWidth}px` });

// The names under a search box (box_suggest.js), for the landing box and the
// search page's top box alike. The list is the box's own business, so its
// state lives here: whether the box has focus, which name the arrows are on,
// where the list sits, and the text it was closed for (Escape, a pick, a
// search; typing on opens it again).
//
// text: the box as typed. getPath(text): the request for its names.
// onPick(item): a name picked.
// Returns list (SuggestList's props), input (the box's combobox props) and
// typed(e), for the box's onChange.
export function useBoxSuggest(text, getPath, onPick) {
  const [focused, setFocused] = useState(false);
  const [closedFor, setClosedFor] = useState(null);
  const [active, setActive] = useState({ for: null, at: -1 });
  const [place, setPlace] = useState(undefined);
  // The request, fixed when the box is typed in or focused (input, focus →
  // soon), so a filter changed meanwhile asks nothing; round: every one asks.
  const [ask, setAsk] = useState({ path: null, round: 0 });
  const askFor = (typed) => {
    const t = typed.trim();
    setAsk({ path: suggestable(t) ? getPath(t) : null, round: ask.round + 1 });
  };

  const trimmed = text.trim();
  const wanted = focused && suggestable(trimmed) ? trimmed : null;
  const { data: reply } = useApi(focused ? ask.path : null, SUGGEST_MS, ask.round);
  const items = reply?.groups.flatMap((g) => g.items) ?? [];
  const open = wanted !== null && reply?.text === wanted && items.length > 0 && closedFor !== wanted;
  // The arrows have moved in this list: only then do its names say which is on.
  const selecting = open && active.for === wanted;
  const at = selecting ? active.at : -1;
  // A new list starts with no name on (draw), whatever the arrows did before.
  const fresh = () => setActive({ for: null, at: -1 });

  const pick = (item) => {
    setClosedFor(item.filter ? "" : item.value);
    onPick(item);
  };

  function onKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive({ for: wanted, at: nextActive(e.key, at, items.length) });
    } else if (e.key === "Enter" && at >= 0) {
      e.preventDefault();
      pick(items[at]);
    } else if (e.key === "Enter") {
      // Searching what was typed closes the list (the form's submit).
      setClosedFor(wanted);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setClosedFor(wanted);
    }
  }

  return {
    list: { reply, open, active: at, selecting, place, onPick: pick },
    input: {
      role: "combobox", "aria-autocomplete": "list", "aria-controls": LIST_ID, "aria-expanded": open,
      "aria-activedescendant": at >= 0 ? optionId(at) : undefined,
      onFocus: (e) => { setPlace(under(e.target)); setClosedFor(null); setFocused(true); askFor(text); fresh(); },
      onBlur: () => setFocused(false),
      onKeyDown,
    },
    typed: (e) => { setPlace(under(e.target)); setClosedFor(null); askFor(e.target.value); fresh(); },
    close: () => setClosedFor(wanted),
  };
}
