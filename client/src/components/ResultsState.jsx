import DidYouMean from "./DidYouMean.jsx";

// What the results area says instead of results (search.ejs): the spinner
// while searching, the server's message when it fails, No entries found when
// nothing matches, with any close searches under it.
// suggestions, hrefOf, onPick: passed on to DidYouMean.
function ResultsState({ busy, error, empty, suggestions, hrefOf, onPick }) {
  return (
    <>
      <div className={busy ? "loading_state" : "loading_state hidden"}>
        <span className="spinner"></span>
        <span>Searching...</span>
      </div>
      <div className={error ? "error_state" : "error_state hidden"}>
        <span className="error_text">{error}</span>
      </div>
      <div className={empty ? "empty_state" : "empty_state hidden"}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M11 8v6M8 11h6" />
        </svg>
        <span>No entries found</span>
        <DidYouMean suggestions={empty ? suggestions : []} hrefOf={hrefOf} onPick={onPick} />
      </div>
    </>
  );
}

export default ResultsState;
