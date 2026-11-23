import { Fragment } from "react";
import Sequence from "./Sequence.jsx";

const none = <span className="molecule_sub">none</span>;

// One polymer: its row of the table, then its sequence on a row of its own.
function MoleculeRow({ pdbId, row }) {
  return (
    <>
      <tr>
        <td>{row.name}{row.length && <div className="molecule_sub">{row.length}</div>}</td>
        <td>
          {row.chains.map((chain, i) => (
            <Fragment key={chain.name}>{i > 0 && ", "}<span title={chain.title ?? undefined}>{chain.name}</span></Fragment>
          ))}
        </td>
        <td>{row.modelled ?? none}{row.missing && <div className="molecule_sub">missing {row.missing}</div>}</td>
        <td>{row.numbering ?? none}</td>
        <td>
          {row.links.length === 0 && none}
          {row.links.map((link) => (
            <div key={link.text}>{link.url ? <a target="_blank" rel="noopener" href={link.url}>{link.text}</a> : link.text}</div>
          ))}
        </td>
      </tr>
      {row.sequence && (
        <tr className="sequence_row">
          <td colSpan={5}><Sequence pdbId={pdbId} entityId={row.entity_id} sequence={row.sequence} /></td>
        </tr>
      )}
    </>
  );
}

export default MoleculeRow;
