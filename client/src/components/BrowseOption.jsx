import { press } from "../press.js";
import { number } from "../format.js";

function BrowseOption({ option, on, onToggle }) {
  return (
    <li>
      <a href={option.url} data-say={option.say} role="checkbox" aria-checked={on} {...press(onToggle)}>
        <span className="browse_name">
          {option.label}
          {option.note && <> <small title={option.note}>{option.note}</small></>}
        </span>
        <span className="browse_count">{number(option.count)}</span>
        <span className="browse_tick" aria-hidden="true"></span>
        <span className="browse_bar" style={{ "--share": option.share.toFixed(3) }}></span>
      </a>
    </li>
  );
}

export default BrowseOption;
