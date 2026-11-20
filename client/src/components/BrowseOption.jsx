function BrowseOption({ option }) {
  return (
    <li>
      <a href={option.url} data-say={option.say}>
        <span className="browse_name">
          {option.label}
          {option.note && <> <small title={option.note}>{option.note}</small></>}
        </span>
        <span className="browse_count">{option.count.toLocaleString("en-GB")}</span>
        <span className="browse_tick" aria-hidden="true"></span>
        <span className="browse_bar" style={{ "--share": option.share.toFixed(3) }}></span>
      </a>
    </li>
  );
}

export default BrowseOption;
