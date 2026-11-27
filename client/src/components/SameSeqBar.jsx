function ChainOptions({ group, other }) {
  return group.entries.map((e) => (
    <optgroup key={e.entry} label={`${e.entry}${e.this ? " (this page)" : ""}`}>
      {e.chains.map((c) => (
        <option key={c.id} value={c.id} disabled={c.id === other}>{c.name}{c.id === group.best ? " · best model" : ""}</option>
      ))}
    </optgroup>
  ));
}

function SameSeqBar({ group, a, b, open, expanded, onPick, onSwap, onRun, onExpand, onCollapse }) {
  return (
    <div className="ss_bar" role="group" aria-label="Compare two chains">
      <span className="ss_bar_title">Compare any two</span>
      <label className="ss_pick"><span className="ss_ab ss_ab_a">A</span>
        <select data-side="a" aria-label="Chain A" value={a} onChange={(ev) => onPick("a", ev.target.value)}><ChainOptions group={group} other={b} /></select>
      </label>
      <button type="button" className="ss_swap" title="Swap A and B" aria-label="Swap A and B" onClick={onSwap}>⇄</button>
      <label className="ss_pick"><span className="ss_ab ss_ab_b">B</span>
        <select data-side="b" aria-label="Chain B" value={b} onChange={(ev) => onPick("b", ev.target.value)}><ChainOptions group={group} other={a} /></select>
      </label>
      <button type="button" className="ss_run" onClick={onRun}>Compare</button>
      <button type="button" className="ss_full" aria-expanded={expanded} hidden={!open}
              onClick={expanded ? onCollapse : onExpand}>{expanded ? "⤡ Collapse" : "⤢ Expand"}</button>
    </div>
  );
}

export default SameSeqBar;
