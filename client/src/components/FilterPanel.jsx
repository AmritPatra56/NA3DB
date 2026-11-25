import Category from "./Category.jsx";
import TextField from "./TextField.jsx";
import NumberField from "./NumberField.jsx";
import RangeField from "./RangeField.jsx";
import PillGroup from "./PillGroup.jsx";
import { fieldsOf, pillsOf } from "../panelForm.js";

// The filter panel (search.ejs query_panel), drawn from the registry: nothing
// here names a filter. It only shows the form it is given and calls back up.
// panel: the form (panelForm.js). counts: /api/pill_counts. asked: every value
// the page was opened with. onSubmit: Search pressed (or Enter in a box).
function FilterPanel({ registry, panel, counts, asked, busy, onValue, onPill, onSubmit }) {
  function field(f) {
    if (f.kind === "text") return <TextField key={f.key} filter={f} value={panel.values[f.key]} onValue={onValue} />;
    if (f.kind === "number") return <NumberField key={f.key} filter={f} value={panel.values[f.key]} onValue={onValue} />;
    if (f.kind === "range") return <RangeField key={f.key} filter={f} values={panel.values} shown={panel.shown[f.key]} onValue={onValue} />;
    return <PillGroup key={f.key} filter={f} pills={pillsOf(f, counts, asked)} picked={panel.values[f.key]} onPill={onPill} />;
  }

  return (
    <form className="query_panel" id="query_form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}>
      <div className="query_panel_header">
        <h1>Full search</h1>
      </div>
      <div className="query_panel_body">
        {panel && counts && registry.groups.map((group) => (
          <Category key={group.slug} group={group}>{fieldsOf(registry, group).map(field)}</Category>
        ))}
      </div>
      <div className="query_panel_footer">
        <button type="submit" className="search" disabled={busy}>Search</button>
      </div>
    </form>
  );
}

export default FilterPanel;
