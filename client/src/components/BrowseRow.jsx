import BrowseOption from "./BrowseOption.jsx";

function BrowseRow({ row }) {
  return (
    <li className="browse_row">
      <a className="browse_link" href={row.url}>
        <span className="browse_name">{row.label}</span>
        <span className="browse_count">{row.count.toLocaleString("en-GB")}</span>
        <span className="browse_bar" style={{ "--share": row.share.toFixed(3) }}></span>
      </a>
      <span className="browse_answer" role="group" aria-label={row.label}>
        <a className="browse_yes" href={row.url} data-say={row.say_yes}>Yes</a>
        <a className="browse_no" href={row.no_url} data-say={row.say_no}>No</a>
      </span>
      {row.options.length > 0 && (
        <div className="browse_options" hidden>
          <p className="browse_options_name">
            {row.options_name ?? `${row.options.length} most frequent`} <small>Tick any to narrow it down</small>
          </p>
          <ul aria-label={`${row.label}, ${(row.options_name ?? "most frequent").toLowerCase()}`}>
            {row.options.map((option) => (
              <BrowseOption key={option.label} option={option} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default BrowseRow;
