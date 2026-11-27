import Category from "./Category.jsx";
import TextField from "./TextField.jsx";
import SuggestField from "./SuggestField.jsx";
import NumberField from "./NumberField.jsx";
import RangeField from "./RangeField.jsx";
import PillGroup from "./PillGroup.jsx";
import { fieldsOf, pillsOf } from "../panelForm.js";

function FilterPanel({ registry, panel, counts, asked, open, busy, label, onValue, onFill, onPill, onSubmit }) {
  function field(f) {
    if (f.kind === "text" && f.suggest) return <SuggestField key={f.key} filter={f} value={panel.values[f.key]} onValue={onValue} onFill={onFill} />;
    if (f.kind === "text") return <TextField key={f.key} filter={f} value={panel.values[f.key]} onValue={onValue} />;
    if (f.kind === "number") return <NumberField key={f.key} filter={f} value={panel.values[f.key]} onValue={onValue} />;
    if (f.kind === "range") return <RangeField key={f.key} filter={f} values={panel.values} shown={panel.shown[f.key]} onValue={onValue} />;
    return <PillGroup key={f.key} filter={f} pills={pillsOf(f, counts, asked)} picked={panel.values[f.key]} onPill={onPill} />;
  }

  return (
    <form className={`query_panel${open ? "" : " folded"}`} id="query_form" inert={!open}
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
        <button type="submit" className="search" disabled={busy}>{label}</button>
      </div>
    </form>
  );
}

export default FilterPanel;
