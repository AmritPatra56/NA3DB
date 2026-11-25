// The names under a panel box: code, name (a modified nucleotide's parent base
// first), entries. Shows what SuggestField gives it; a press is handed back up.
function NameList({ ref, id, names, open, active, onPick }) {
  return (
    <ul ref={ref} className="suggest_list" id={id} role="listbox" hidden={!open}>
      {names.map((s, i) => (
        <li role="option" id={`${id}_${i}`} key={s.code} aria-selected={i === active}
            // mousedown, not click: click comes after the box's blur closes the list.
            onMouseDown={(e) => { e.preventDefault(); onPick(s); }}>
          <b>{s.code}</b>
          <span>{s.parent && <em>from {s.parent} · </em>}{s.name ?? ""}</span>
          <small>{s.entries}</small>
        </li>
      ))}
    </ul>
  );
}

export default NameList;
