function PickedLine({ summary, onClear }) {
  return (
    <div className="picked_line" hidden={!summary}>
      <p className="pick_what" title={summary}>{summary}</p>
      <button type="button" className="pick_clear" onClick={onClear}>Clear</button>
    </div>
  );
}

export default PickedLine;
