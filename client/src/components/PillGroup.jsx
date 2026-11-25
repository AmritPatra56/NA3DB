import { useState } from "react";
import { number } from "../format.js";

// One pill group. Its first options always show, the rest behind "N more"
// (unfolded when the page opens with one of them picked; a picked one keeps
// it unfolded). Bands are drawn too; the CSS shows them only while on.
// pills: { options, bands } from pillsOf. picked: the values on, "any" too.
// onPill(key, value): a pill clicked.
function PillGroup({ filter, pills, picked, onPill }) {
  const extras = pills.options.filter((o) => o.extra);
  const extraPicked = extras.some((o) => picked.includes(o.value));
  const [open, setOpen] = useState(extraPicked);
  const on = (value) => (picked.includes(value) ? " selected" : "");

  return (
    <div className="pill_group">
      <div className="group_label">{filter.label}</div>
      <div className="pill_field" data-name={filter.key}>
        {filter.any && <button type="button" className={`pill${on("any")}`} data-value="any"
                               onClick={() => onPill(filter.key, "any")}>Any</button>}
        {pills.options.map((o) => (
          <button type="button" key={o.value} className={`pill${o.extra ? " pill_extra" : ""}${on(o.value)}`}
                  data-value={o.value} hidden={o.extra && !open} onClick={() => onPill(filter.key, o.value)}>
            {o.label}{o.count !== null && <> <span className="pill_count">{number(o.count)}</span></>}
          </button>
        ))}
        {pills.bands.map((o) => (
          <button type="button" key={o.value} className={`pill pill_band${on(o.value)}`}
                  data-value={o.value} onClick={() => onPill(filter.key, o.value)}>{o.label}</button>
        ))}
        {extras.length > 0 && (
          <button type="button" className="pill_more" aria-expanded={open}
                  data-more={`${extras.length} more`} data-less="Fewer"
                  onClick={() => setOpen(!open || extraPicked)}>
            <span>{open ? "Fewer" : `${extras.length} more`}</span> <i className="arrow" aria-hidden="true"></i>
          </button>
        )}
      </div>
    </div>
  );
}

export default PillGroup;
