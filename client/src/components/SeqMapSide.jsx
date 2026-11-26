import { quickPick, strandNote } from "../seqMap.js";

// The strand list beside the expanded map (seqmap.js make_dialog): All,
// Pairing with the ticked, a box per strand, and go › to a shown strand's 5′
// end. The last box ticked cannot be unticked: the ruler is never empty.
function SeqMapSide({ map, ticked, onStrands, onGo }) {
  function tick(key, on) {
    const keys = map.strands.map((s) => s.key).filter((k) => (k === key ? on : ticked.includes(k)));
    if (keys.length) onStrands(keys);
  }
  return (
    <aside className="smd_side">
      <h4>Strands on the ruler</h4>
      <div className="smd_quick">
        <button type="button" data-pick="all" onClick={() => onStrands(quickPick(map, "all"))}>All</button>
        <button type="button" data-pick="partners" onClick={() => onStrands(quickPick(map, "partners"))}>Pairing with the ticked</button>
      </div>
      <ul className="smd_strands">
        {map.strands.map((s) => (
          <li key={s.key}>
            <label><input type="checkbox" value={s.key} checked={ticked.includes(s.key)} onChange={(ev) => tick(s.key, ev.target.checked)} /> {s.name}</label>
            {" "}<span className="smd_meta">{strandNote(map, s)}</span>
            {map.shown.includes(s.key) && <>{" "}<button type="button" className="smd_go" data-key={s.key} title="Go to its 5′ end" onClick={() => onGo(map.shown.indexOf(s.key))}>go ›</button></>}
          </li>
        ))}
      </ul>
      <p className="smd_note">Tick strands to put them side by side on one ruler; their pairs to each other show in the rows. A name jumps to its 5′ end.</p>
    </aside>
  );
}

export default SeqMapSide;
