import { useEffect, useRef, useState } from "react";
import NameList from "./NameList.jsx";
import { useApi } from "../hooks/useApi.js";
import { CLOSED, namesFor, drawn, closed, stepped } from "../nameSuggest.js";

// A panel box with a name list (organism, host, residue, ligand). The names
// are asked for once, the first time the box is focused or typed in.
// onValue(name, value): the [name] handler; a pick fills the box with its code.
function SuggestField({ filter, value, onValue }) {
  const [wanted, setWanted] = useState(false);
  const reply = useApi(wanted ? `/api/${filter.suggest}` : null);
  const [list, setList] = useState(CLOSED);
  const listId = `${filter.key}_options`;
  const listRef = useRef(null);

  // Not loaded yet: nothing; failed: nothing, and the box still searches.
  const all = reply.data ?? [];
  const names = list.text === null ? [] : namesFor(all, list.text);
  const shown = list.open && names.length > 0;

  // The name the arrows reach stays in view.
  useEffect(() => {
    if (list.active >= 0) listRef.current?.children[list.active]?.scrollIntoView({ block: "nearest" });
  }, [list.active]);

  function pick(s) {
    onValue(filter.key, s.code);
    setList(closed(list));
  }

  function onKeyDown(e) {
    if (!shown) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setList(stepped(list, value, e.key, names.length));
    } else if (e.key === "Enter" && list.active >= 0) {
      e.preventDefault();
      pick(names[list.active]);
    } else if (e.key === "Escape") {
      setList(closed(list));
    }
  }

  return (
    <div className="field suggest_field">
      <label htmlFor={filter.key}>{filter.label}</label>
      <input type="text" id={filter.key} name={filter.key} placeholder={filter.placeholder}
             data-suggest={filter.suggest} autoComplete="off" role="combobox" aria-autocomplete="list"
             aria-expanded={shown} aria-controls={listId}
             aria-activedescendant={shown && list.active >= 0 ? `${listId}_${list.active}` : undefined}
             value={value}
             onFocus={() => { setWanted(true); setList(drawn(list, value, false)); }}
             onChange={(e) => { setWanted(true); onValue(e.target.name, e.target.value); setList(drawn(list, e.target.value, true)); }}
             onBlur={() => setList(closed(list))}
             onKeyDown={onKeyDown} />
      <NameList ref={listRef} id={listId} names={names} open={shown} active={list.active} onPick={pick} />
    </div>
  );
}

export default SuggestField;
