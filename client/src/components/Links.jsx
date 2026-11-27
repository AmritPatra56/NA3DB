function Links({ pdbId, fasta, pairs }) {
  const id = encodeURIComponent(pdbId);
  return (
    <>
      <div className="link_files">
        {fasta > 0 && <a className="download" href={`/structure/${id}/fasta`} download>Sequences as FASTA</a>}
        {pairs && <a className="download" href={`/api/entries/${id}/base_pairs?format=csv`} download>Base pairs as CSV</a>}
      </div>
      <ul className="link_list">
        <li><a target="_blank" rel="noopener" href={`https://www.rcsb.org/structure/${id}`}>View on rcsb.org</a></li>
        <li><a href={`/report?entry_id=${id}`}>Report of this entry, as CSV or Excel</a></li>
        <li><a href={`/api/entries/${id}`}>This entry as JSON</a></li>
      </ul>
    </>
  );
}

export default Links;
