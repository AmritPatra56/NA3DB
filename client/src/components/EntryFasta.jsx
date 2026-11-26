import DownloadMenu from "./DownloadMenu.jsx";

// The Molecules band's FASTA (structure.ejs): one file, or, when the entry
// has proteins too, a menu of the nucleic acids alone or every polymer.
// fasta: {all, na}, how many sequences each file holds.
function EntryFasta({ pdbId, fasta }) {
  const url = `/structure/${pdbId}/fasta`;
  if (fasta.na && fasta.na < fasta.all) {
    return (
      <DownloadMenu label="FASTA" title="Download sequences as FASTA">
        <a href={`${url}?only=na`} download>Nucleic acids only <span>{fasta.na} {fasta.na === 1 ? "molecule" : "molecules"}</span></a>
        <a href={url} download>All polymers <span>{fasta.all} molecules</span></a>
      </DownloadMenu>
    );
  }
  if (!fasta.all) return null;
  const what = fasta.all === 1 ? "the sequence" : `all ${fasta.all} sequences`;
  return <a className="download download_small" href={url} download title={`Download ${what} as FASTA`}>FASTA</a>;
}

export default EntryFasta;
