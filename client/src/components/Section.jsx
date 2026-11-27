import { PAGE_GROUPS } from "../structure.js";
import { NONE_RECORDED } from "../constants.js";
import HelpNote from "./HelpNote.jsx";

function Section({ id, title, group, empty, none = NONE_RECORDED, tools, help, helpOpen, onHelp, onHelpClose, folded, onFold, children }) {
  const groupLabel = PAGE_GROUPS.find((g) => g.key === group).label;
  return (
    <section id={id} className={`page_section group_${group}${empty ? " empty" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="section_band">
        <div className="band_title">
          {title !== groupLabel && <><span className="band_group">{groupLabel}</span>{" "}</>}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <div className="band_tools">{tools}{help && <HelpNote name={id} text={help} open={helpOpen} onToggle={onHelp} onClose={onHelpClose} />}
          <button type="button" className="band_fold" aria-expanded={!folded} aria-controls={`${id}-body`}
                  title={folded ? "Open this section" : "Fold this section"} onClick={() => onFold(id)}>
            <i className="arrow" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div className="section_body" id={`${id}-body`} hidden={folded}>
        {children}
        {empty && <p className="section_none">{none}</p>}
      </div>
    </section>
  );
}

export default Section;
