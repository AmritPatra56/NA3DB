import { Fragment } from "react";
import { sourceClass } from "../structure.js";

const none = <span className="molecule_sub">none</span>;

// An organism: in italics when it is a species name, its common name after it.
function Organism({ organism }) {
  if (!organism) return none;
  return (
    <>
      {organism.italic ? <i>{organism.name}</i> : organism.name}
      {organism.common && <> <span className="molecule_sub">({organism.common})</span></>}
    </>
  );
}

// A taxonomy id, linked to NCBI.
function Taxon({ taxon }) {
  if (!taxon) return none;
  return <a target="_blank" rel="noopener" title="NCBI Taxonomy" href={taxon.url}>{taxon.id}</a>;
}

// One source: a line per segment (a chimera has several), the molecule,
// chains, kind and host spanning them all. Many molecules fold into
// "N molecules", each with its chains.
function SourceRow({ row, notes }) {
  const n = row.segments.length;
  const span = (cell) => <td rowSpan={n}>{cell}</td>;
  const molecules = row.listed
    ? row.molecules.map((m) => <div key={`${m.name}:${m.chains}`}>{m.name}</div>)
    : (
      <details className="more_positions">
        <summary>{row.molecules.length} molecules</summary>
        {row.molecules.map((m) => <div key={`${m.name}:${m.chains}`}>{m.name} <span className="molecule_sub">{m.chains.join(", ")}</span></div>)}
      </details>
    );
  const chains = row.listed
    ? row.molecules.map((m) => <div key={`${m.name}:${m.chains}`}>{m.chains.join(", ")}</div>)
    : `${row.chain_count} chains`;
  const host = row.host
    ? <><Organism organism={row.host.organism} />{row.host.taxon && <> (<Taxon taxon={row.host.taxon} />)</>}</>
    : none;

  return (
    <>
      {/* Segments come in sequence order and are never reordered. */}
      {row.segments.map((seg, i) => (
        <tr key={i} className={i < n - 1 ? "segment_continues" : undefined}>
          {i === 0 && <>{span(molecules)}{span(chains)}{span(<span className={`source_kind ${sourceClass(row.kind)}`}>{row.kind}</span>)}</>}
          <td>{seg.range && <Fragment><b>{seg.range}</b> </Fragment>}<Organism organism={seg.organism} /></td>
          <td><Taxon taxon={seg.taxon} /></td>
          {i === 0 && span(host)}
          {notes && <td className="molecule_sub">{seg.notes ?? ""}</td>}
        </tr>
      ))}
    </>
  );
}

export default SourceRow;
