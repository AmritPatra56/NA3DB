import SuggestList from "./SuggestList.jsx";
import BoxCount from "./BoxCount.jsx";
import { useBoxSuggest } from "../hooks/useBoxSuggest.js";
import { BOX_PLACEHOLDER } from "../constants.js";

// The bar above the panel (search.ejs top_search): Contains or Excludes, the
// prominent box with its Search button and its name list, and the count as
// you type. The list is the box's own (useBoxSuggest); the rest is props.
// onMatch(mode): Contains or Excludes picked. Excludes turns the whole search
// round: every entry the filters would not find.
// values, onValue: the panel's form, as the box is part of it.
// suggestPath(text): the request for the box's names, counted with every
// other filter. onPick(item): a name picked. count, onSuggest: BoxCount's.
function TopSearch({ registry, query, values, onValue, onMatch, suggestPath, onPick, count, onSuggest }) {
  const box = registry.filters.find((f) => f.prominent);
  const names = useBoxSuggest(values[box.key], suggestPath, onPick);
  return (
    <div className="top_search">
      <div className="match_switch" role="group" aria-label="How the search matches">
        {registry.match_modes.map((mode) => (
          <button type="button" key={mode.key} data-match={mode.key}
                  aria-pressed={query.match === mode.key}
                  onClick={() => mode.key !== query.match && onMatch(mode.key)}>{mode.label}</button>
        ))}
      </div>
      <div className="top_search_box">
        <input type="text" id={box.key} name={box.key} form="query_form" autoComplete="off"
               placeholder={BOX_PLACEHOLDER}
               {...names.input}
               value={values[box.key]}
               onChange={(e) => { names.typed(e); onValue(e.target.name, e.target.value); }} />
        <button type="submit" form="query_form">Search</button>
        <SuggestList {...names.list} />
      </div>
      <BoxCount count={count} onSuggest={onSuggest} />
    </div>
  );
}

export default TopSearch;
