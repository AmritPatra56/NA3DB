function ChipsBar({ chips, onRemove }) {
  return (
    <div className="active_filters" role="group" aria-label="Filters in use">
      {chips.map((c) => (
        <button key={c.key + "\n" + c.value} type="button" className="filter_chip" data-key={c.key} data-value={c.value}
                aria-label={`Remove ${c.text}`} onClick={() => onRemove(c)}>
          {c.text}<span aria-hidden="true">&times;</span>
        </button>
      ))}
    </div>
  );
}

export default ChipsBar;
