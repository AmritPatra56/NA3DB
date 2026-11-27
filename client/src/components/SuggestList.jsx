import { number } from "../format.js";
import { GROUP_LABELS, LIST_ID, optionId, marked } from "../suggest.js";

function SuggestList({ reply, open, active, selecting, place, onPick }) {
  let i = -1;
  return (
    <ul id={LIST_ID} className="box_suggest" role="listbox" aria-label="Suggestions" hidden={!open} style={place}>
      {reply?.near && <li role="presentation" className="box_suggest_near">Nothing starts with “{reply.text}”. Close spellings:</li>}
      {reply?.groups.map((group) => [
        <li role="presentation" className="box_suggest_group" key={group.kind}>{GROUP_LABELS[group.kind] ?? group.kind}</li>,
        ...group.items.map((item) => {
          i += 1;
          const at = i;
          const [before, mark, after] = marked(item.label, reply.text);
          return (
            <li role="option" id={optionId(at)} aria-selected={selecting ? at === active : undefined} key={`${group.kind} ${item.value}`}
                // mousedown, not click: click comes after the input's blur has closed the list.
                onMouseDown={(e) => { e.preventDefault(); onPick(item); }}>
              <span className="box_suggest_name">{before}{mark !== undefined && <mark>{mark}</mark>}{after}</span>
              {item.also && <span className="box_suggest_also">{item.also}</span>}
              <small>{item.href ? "Open" : number(item.total)}</small>
            </li>
          );
        }),
      ])}
      {i >= 0 && <li role="presentation" className="box_suggest_foot">Picking one searches exactly that. Enter searches what you typed.</li>}
    </ul>
  );
}

export default SuggestList;
