import PolymerTable from "./PolymerTable.jsx";
import ModifiedTable from "./ModifiedTable.jsx";
import LigandTable from "./LigandTable.jsx";

function MoleculeGroup({ pdbId, group }) {
  return (
    <details className="molecule_group" open={!group.folded}>
      <summary>{group.title} ({group.rows.length})</summary>
      <div className="molecule_scroll">
        <table className="molecule_table">
          {group.modified ? <ModifiedTable group={group} />
            : group.polymer ? <PolymerTable pdbId={pdbId} rows={group.rows} />
            : <LigandTable rows={group.rows} />}
        </table>
      </div>
    </details>
  );
}

export default MoleculeGroup;
