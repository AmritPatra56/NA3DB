import { Fragment } from "react";

// The bar above the panel (search.ejs top_search): Contains or Excludes, the
// prominent box with its Search button, and the count as you type. Drawn from
// the address; the box and count work in 7.13.
// onMatch(mode): Contains or Excludes picked. Excludes turns the whole search
// round: every entry the filters would not find.
// values, onValue: the panel's form, as the box is part of it.
function TopSearch({ registry, query, values, onValue, onMatch }) {
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
        {registry.filters.filter((f) => f.prominent).map((f) => (
          <Fragment key={f.key}>
            <input type="text" id={f.key} name={f.key} form="query_form" autoComplete="off"
                   placeholder="Search an id, molecule, author or organism"
                   value={values[f.key]} onChange={(e) => onValue(e.target.name, e.target.value)} />
            <button type="submit" form="query_form">Search</button>
          </Fragment>
        ))}
      </div>
      <p className="top_search_count" aria-live="polite"></p>
    </div>
  );
}

export default TopSearch;
