import ResultCard from "./ResultCard.jsx";
import ResultLine from "./ResultLine.jsx";
import GridTile from "./GridTile.jsx";

const VIEWS = { cards: ResultCard, lines: ResultLine, grid: GridTile };
const LIST_CLASS = { cards: " as_cards", lines: "", grid: " as_grid" };

function ResultsList({ entries, view, hidden }) {
  const View = VIEWS[view];
  return (
    <div className={"results_list" + LIST_CLASS[view] + (hidden ? " hidden" : "")}>
      {entries.map((entry) => <View key={entry.pdb_id} entry={entry} />)}
    </div>
  );
}

export default ResultsList;
