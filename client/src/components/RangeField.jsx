function RangeField({ filter, values, shown, onValue }) {
  const by = filter.revealed_by;
  const box = (f, end) => (
    <input type="number" id={f.key} name={f.key} step="any" min="0" inputMode="decimal"
           aria-label={`${filter.label}, ${end}`} placeholder={f.placeholder}
           value={values[f.key]} onChange={(e) => onValue(e.target.name, e.target.value)} />
  );
  return (
    <div className={`field${by ? " revealed_field" : ""}`}
         data-revealed-by={by?.key} data-values={by?.values.join("|")} hidden={by ? !shown : undefined}>
      <div className="group_label" id={`${filter.key}_label`}>{filter.label}</div>
      <div className="range_row" role="group" aria-labelledby={`${filter.key}_label`}>
        {box(filter, "lowest")}
        <span className="range_dash"></span>
        {box(filter.partner, "highest")}
      </div>
    </div>
  );
}

export default RangeField;
