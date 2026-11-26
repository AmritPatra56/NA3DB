// Save the primary citation for a reference manager (cite_save.ejs). Two
// places use it: beside Published at the top, and in the Citation section.
function CiteSave({ pdbId, where }) {
  const file = `/structure/${pdbId}/citation?format=`;
  return (
    <details className={`entry_fasta cite_save cite_save_${where}`}>
      <summary className="download download_small" title="Save the citation for a reference manager">Save reference</summary>
      <div className="entry_fasta_menu">
        <a href={`${file}ris`} download>EndNote, Zotero, Mendeley <span>.ris</span></a>
        <a href={`${file}bib`} download>BibTeX, LaTeX <span>.bib</span></a>
      </div>
    </details>
  );
}

export default CiteSave;
