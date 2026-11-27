function NumberField({ filter, value, onValue }) {
  return (
    <div className="field">
      <label htmlFor={filter.key}>{filter.label}</label>
      <input type="text" inputMode="numeric" id={filter.key} name={filter.key} placeholder={filter.placeholder}
             value={value} onChange={(e) => onValue(e.target.name, e.target.value)} />
    </div>
  );
}

export default NumberField;
