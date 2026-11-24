import BrowseOption from "./BrowseOption.jsx";
import { press } from "../press.js";
import { number } from "../format.js";

// One row: its name, Yes, No and, under Yes, its options. Landing keeps the
// answer and the ticks (lifting state up); the row shows them and asks.
function BrowseRow({ row, answer, ticked, onAnswer, onTick }) {
  const hasOptions = row.options.length > 0;

  return (
    <li className="browse_row">
      {/* The name presses Yes for a mouse; the keyboard has Yes itself. */}
      <a className="browse_link" href={row.url} tabIndex={-1} {...press(() => onAnswer("yes"))}>
        <span className="browse_name">{row.label}</span>
        <span className="browse_count">{number(row.count)}</span>
        <span className="browse_bar" style={{ "--share": row.share.toFixed(3) }}></span>
      </a>
      <span className="browse_answer" role="group" aria-label={row.label}>
        <a className="browse_yes" href={row.url} data-say={row.say_yes} role="button"
           aria-pressed={answer === "yes"} {...press(() => onAnswer("yes"))}
           aria-expanded={hasOptions ? answer === "yes" : undefined}>
          Yes{hasOptions && <i className="arrow" aria-hidden="true"></i>}
        </a>
        <a className="browse_no" href={row.no_url} data-say={row.say_no} role="button"
           aria-pressed={answer === "no"} {...press(() => onAnswer("no"))}>No</a>
      </span>
      {/* The options show only while Yes is on: one more thing worked out from answer. */}
      {hasOptions && (
        <div className="browse_options" hidden={answer !== "yes"}>
          <p className="browse_options_name">
            {row.options_name ?? `${row.options.length} most frequent`} <small>Tick any to narrow it down</small>
          </p>
          <ul aria-label={`${row.label}, ${(row.options_name ?? "most frequent").toLowerCase()}`}>
            {row.options.map((option) => (
              <BrowseOption key={option.label} option={option}
                            on={ticked.includes(option.label)} onToggle={() => onTick(option.label)} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default BrowseRow;
