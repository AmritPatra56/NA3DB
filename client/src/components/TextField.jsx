// A plain text box in the panel. One with a name list is a SuggestField.
// onValue(name, value): the [name] handler.
function TextField({ filter, value, onValue }) {
  return (
    <div className="field">
      <label htmlFor={filter.key}>{filter.label}</label>
      <input type="text" id={filter.key} name={filter.key} placeholder={filter.placeholder}
             value={value} onChange={(e) => onValue(e.target.name, e.target.value)} />
    </div>
  );
}

export default TextField;
