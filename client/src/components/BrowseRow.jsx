import { useState } from "react";
import BrowseOption from "./BrowseOption.jsx";

// A click meant to open the link elsewhere (Ctrl, Cmd, Shift, Alt) still does.
const opensElsewhere = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

function BrowseRow({ row }) {
  // "off", "yes" or "no". Pressing the one already on turns it off.
  const [answer, setAnswer] = useState("off");
  // The labels of the options ticked under Yes, in the order ticked.
  const [ticked, setTicked] = useState([]);
  const hasOptions = row.options.length > 0;

  // Off, Yes or No. Leaving Yes empties its ticks (pick.js answer).
  const give = (target) => {
    const next = answer === target ? "off" : target;
    setAnswer(next);
    if (next !== "yes") setTicked([]);
  };

  // A new array every time: in with spread, out with filter.
  const toggle = (label) =>
    setTicked((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);

  // One handler maker for Yes, No and the name, each told which answer it gives.
  const press = (target) => ({
    onClick: (e) => {
      if (opensElsewhere(e)) return;
      e.preventDefault();
      give(target);
    },
    // Space presses a button; Enter already arrives as a click.
    onKeyDown: (e) => {
      if (e.key !== " ") return;
      e.preventDefault();
      give(target);
    },
  });

  return (
    <li className="browse_row">
      {/* The name presses Yes for a mouse; the keyboard has Yes itself. */}
      <a className="browse_link" href={row.url} tabIndex={-1} {...press("yes")}>
        <span className="browse_name">{row.label}</span>
        <span className="browse_count">{row.count.toLocaleString("en-GB")}</span>
        <span className="browse_bar" style={{ "--share": row.share.toFixed(3) }}></span>
      </a>
      <span className="browse_answer" role="group" aria-label={row.label}>
        <a className="browse_yes" href={row.url} data-say={row.say_yes} role="button"
           aria-pressed={answer === "yes"} {...press("yes")}
           aria-expanded={hasOptions ? answer === "yes" : undefined}>Yes</a>
        <a className="browse_no" href={row.no_url} data-say={row.say_no} role="button"
           aria-pressed={answer === "no"} {...press("no")}>No</a>
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
                            on={ticked.includes(option.label)} onToggle={() => toggle(option.label)} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default BrowseRow;
