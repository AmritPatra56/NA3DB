// A click meant to open the link elsewhere (Ctrl, Cmd, Shift, Alt) still does.
const opensElsewhere = (e) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

// on: whether this option is ticked. The row keeps the ticks; the option only asks to flip.
function BrowseOption({ option, on, onToggle }) {
  return (
    <li>
      <a href={option.url} data-say={option.say} role="checkbox" aria-checked={on}
         onClick={(e) => {
           if (opensElsewhere(e)) return;
           e.preventDefault();
           onToggle();
         }}
         // Space ticks a checkbox; Enter already arrives as a click.
         onKeyDown={(e) => {
           if (e.key !== " ") return;
           e.preventDefault();
           onToggle();
         }}>
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
