import { Fragment } from "react";
import MoleculeGroup from "./MoleculeGroup.jsx";
import { groupAnchor } from "../structure.js";

// The tables of one section (Molecules, Modified nucleotides or Ligands), one
// per group, with Jump to links when there are several. summary: the line
// Molecules has over its tables.
function Molecules({ sectionId, pdbId, groups, summary }) {
  return (
    <>
      {groups.length > 1 && (
        <div className="jump_to">
          Jump to: {groups.map((group, i) => (
            <Fragment key={group.kind}>{i > 0 && " · "}<a href={`#${groupAnchor(sectionId, group.kind)}`}>{group.title}</a></Fragment>
          ))}
        </div>
      )}
      {summary && <div className="molecules_summary"><span>{summary}</span></div>}
      {groups.map((group) => (
        <div id={groupAnchor(sectionId, group.kind)} key={group.kind}>
          <MoleculeGroup pdbId={pdbId} group={group} />
        </div>
      ))}
    </>
  );
}

export default Molecules;
