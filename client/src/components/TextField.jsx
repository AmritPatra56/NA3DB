// A text box in the panel. One with suggestions carries its (still empty)
// list; the suggestions come in 7.9. onValue(name, value): the [name] handler.
function TextField({ filter, value, onValue }) {
  const suggest = filter.suggest && {
    "data-suggest": filter.suggest, autoComplete: "off", role: "combobox",
    "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": `${filter.key}_options`,
  };
  return (
    <div className={`field${filter.suggest ? " suggest_field" : ""}`}>
      <label htmlFor={filter.key}>{filter.label}</label>
      <input type="text" id={filter.key} name={filter.key} placeholder={filter.placeholder} {...suggest}
             value={value} onChange={(e) => onValue(e.target.name, e.target.value)} />
      {filter.suggest && <ul className="suggest_list" id={`${filter.key}_options`} role="listbox" hidden></ul>}
    </div>
  );
}

export default TextField;
