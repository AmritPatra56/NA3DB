import DownloadMenu from "./DownloadMenu.jsx";

function CiteSave({ pdbId, where }) {
  const file = `/structure/${pdbId}/citation?format=`;
  return (
    <DownloadMenu className={`cite_save cite_save_${where}`} label="Save reference" title="Save the citation for a reference manager">
      <a href={`${file}ris`} download>EndNote, Zotero, Mendeley <span>.ris</span></a>
      <a href={`${file}bib`} download>BibTeX, LaTeX <span>.bib</span></a>
    </DownloadMenu>
  );
}

export default CiteSave;
