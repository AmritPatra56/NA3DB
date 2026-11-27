import { useState } from "react";
import { useApi } from "./useApi.js";
import { suggestable } from "../query.js";
import { LIST_ID, optionId, nextActive } from "../suggest.js";
import { SUGGEST_MS } from "../constants.js";

const under = (input) => ({ left: `${input.offsetLeft}px`, top: `${input.offsetTop + input.offsetHeight + 4}px`,
                            width: `${input.offsetWidth}px` });

export function useBoxSuggest(text, getPath, onPick) {
  const [focused, setFocused] = useState(false);
  const [closedFor, setClosedFor] = useState(null);
  const [active, setActive] = useState({ for: null, at: -1 });
  const [place, setPlace] = useState(undefined);
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
  const selecting = open && active.for === wanted;
  const at = selecting ? active.at : -1;
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
