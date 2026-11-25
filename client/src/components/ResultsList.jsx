import ResultCard from "./ResultCard.jsx";
import ResultLine from "./ResultLine.jsx";
import GridTile from "./GridTile.jsx";

// One page of results, drawn as the chosen view (app.js render_results). Each
// view is one component given the same entry, so a new view is a new file
// and a line here, not a change to the others.
const VIEWS = { cards: ResultCard, lines: ResultLine, grid: GridTile };
const LIST_CLASS = { cards: " as_cards", lines: "", grid: " as_grid" };

// hidden: while a search is running, as set_loading hides the list.
function ResultsList({ entries, view, hidden }) {
  const View = VIEWS[view];
  return (
    <div className={"results_list" + LIST_CLASS[view] + (hidden ? " hidden" : "")}>
      {entries.map((entry) => <View key={entry.pdb_id} entry={entry} />)}
    </div>
  );
}

export default ResultsList;
