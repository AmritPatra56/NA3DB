import { PAGE_GROUPS } from "../structure.js";
import { NONE_RECORDED } from "../constants.js";

// One section of the structure page: its band (group, title, tools) and body.
// none: what an empty one says.
function Section({ id, title, group, empty, none = NONE_RECORDED, tools, children }) {
  const groupLabel = PAGE_GROUPS.find((g) => g.key === group).label;
  return (
    <section id={id} className={`page_section group_${group}${empty ? " empty" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="section_band">
        <div className="band_title">
          {/* JSX drops the line break EJS has here, so the space is written. */}
          {title !== groupLabel && <><span className="band_group">{groupLabel}</span>{" "}</>}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <div className="band_tools">{tools}</div>
      </div>
      <div className="section_body" id={`${id}-body`}>
        {children}
        {empty && <p className="section_none">{none}</p>}
      </div>
    </section>
  );
}

export default Section;
