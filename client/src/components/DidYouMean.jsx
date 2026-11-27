import MeantList from "./MeantList.jsx";

function DidYouMean({ suggestions, getHref, onPick }) {
  if (suggestions.length === 0) return <p className="did_you_mean hidden"></p>;

  function pick(e, s) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onPick(s);
  }

  return (
    <p className="did_you_mean">
      <MeantList suggestions={suggestions} renderItem={(s) => (
        <a href={getHref(s)} data-field={s.field} data-value={s.value} onClick={(e) => pick(e, s)}>{s.value}</a>
      )} />
    </p>
  );
}

export default DidYouMean;
