import SuggestList from "./SuggestList.jsx";
import BoxCount from "./BoxCount.jsx";
import { useBoxSuggest } from "../hooks/useBoxSuggest.js";
import { BOX_PLACEHOLDER } from "../constants.js";

function TopSearch({ registry, query, values, onValue, onMatch, getSuggestPath, onPick, count, onSuggest }) {
  const box = registry.filters.find((f) => f.prominent);
  const names = useBoxSuggest(values[box.key], getSuggestPath, onPick);
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
