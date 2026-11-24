// What the ticked rows ask, in the box where the invitation to type stands,
// and the way to drop them. Shows only what it is given.
function PickedLine({ summary, onClear }) {
  return (
    <div className="picked_line" hidden={!summary}>
      <p className="pick_what" title={summary}>{summary}</p>
      <button type="button" className="pick_clear" onClick={onClear}>Clear</button>
    </div>
  );
}

export default PickedLine;
