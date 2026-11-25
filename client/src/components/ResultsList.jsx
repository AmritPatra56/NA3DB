import ResultCard from "./ResultCard.jsx";

// One page of results, drawn as the chosen view (app.js render_results).
// Cards for now; Lines and Grid join in 7.4 as two more files beside ResultCard.
// hidden: while a search is running, as set_loading hides the list.
function ResultsList({ entries, hidden }) {
  return (
    <div className={hidden ? "results_list as_cards hidden" : "results_list as_cards"}>
      {entries.map((entry) => <ResultCard key={entry.pdb_id} entry={entry} />)}
    </div>
  );
}

export default ResultsList;
