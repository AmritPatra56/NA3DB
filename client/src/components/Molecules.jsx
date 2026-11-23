import { Fragment } from "react";
import MoleculeGroup from "./MoleculeGroup.jsx";

// "DNA" becomes "molecules-dna", "DNA/RNA hybrid" "molecules-dna-rna-hybrid".
const anchor = (kind) => `molecules-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// The polymer tables; ligands and modified nucleotides have sections of their own.
function Molecules({ pdbId, molecules }) {
  const polymers = molecules.groups.filter((group) => group.polymer);
  return (
    <>
      {polymers.length > 1 && (
        <div className="jump_to">
          Jump to: {polymers.map((group, i) => (
            <Fragment key={group.kind}>{i > 0 && " · "}<a href={`#${anchor(group.kind)}`}>{group.title}</a></Fragment>
          ))}
        </div>
      )}
      {molecules.summary && <div className="molecules_summary"><span>{molecules.summary}</span></div>}
      {polymers.map((group) => (
        <div id={anchor(group.kind)} key={group.kind}>
          <MoleculeGroup pdbId={pdbId} group={group} />
        </div>
      ))}
    </>
  );
}

export default Molecules;
