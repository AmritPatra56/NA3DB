import MeantList from "./MeantList.jsx";
import { structures } from "../format.js";

// The count under the top box (paint_box_count), with the panel's count: how
// many structures the box finds with every other filter. None: what it might
// have meant, each a button that searches it. count: /api/count's answer, or
// null for nothing. onSuggest(s): a close spelling picked.
function BoxCount({ count, onSuggest }) {
  const s = count?.suggestions ?? [];
  return (
    <p className="top_search_count" aria-live="polite">
      {count && count.total > 0 && structures(count.total)}
      {count?.total === 0 && "no structures match"}
      {count?.total === 0 && s.length > 0 && (
        <>
          {". "}
          <MeantList suggestions={s} renderItem={(x) => (
            <button type="button" className="link_button" data-field={x.field} data-value={x.value}
                    onClick={() => onSuggest(x)}>{x.value}</button>
          )} />
        </>
      )}
    </p>
  );
}

export default BoxCount;
