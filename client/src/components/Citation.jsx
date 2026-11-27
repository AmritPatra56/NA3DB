import { Fragment } from "react";
import CiteSave from "./CiteSave.jsx";
import CopyButton from "./CopyButton.jsx";

function Source({ c, unpublished }) {
  if (unpublished) return "Not yet published.";
  if (c.type === "preprint") return <><i>{c.journal}</i> preprint{c.year && ` (${c.year})`}</>;
  const where = [c.volume && c.volume + (c.issue ? `(${c.issue})` : ""), c.pages].filter(Boolean).join(", ");
  const parts = [
    c.type === "chapter" && c.book_title && <>In <i>{c.book_title}</i>.</>,
    c.journal && <i>{c.journal}</i>,
    where,
    c.year && `(${c.year})`,
  ].filter(Boolean);
  return parts.map((p, n) => <Fragment key={n}>{n > 0 && " "}{p}</Fragment>);
}

function Citation({ pdbId, c, text, unpublished, authors }) {
  return (
    <div className="citation">
      {c.title && <div className="citation_title">{c.title}</div>}
      {authors && <div className="citation_authors">{authors}</div>}
      <div className="citation_source"><Source c={c} unpublished={unpublished} /></div>
      {c.abstract && (
        <details className="citation_abstract">
          <summary>Abstract</summary>
          <p>{c.abstract}</p>
        </details>
      )}
      <div className="citation_actions">
        <CiteSave pdbId={pdbId} where="section" />
        <CopyButton text={text} title="Copy the citation as text" className="sequence_copy cite_copy">Copy</CopyButton>
        {c.doi_url && <a className="detail_link" target="_blank" rel="noopener" href={c.doi_url}>DOI {c.doi}</a>}
        {c.pubmed_url && <a className="detail_link" target="_blank" rel="noopener" href={c.pubmed_url}>PubMed {c.pubmed}</a>}
      </div>
    </div>
  );
}

export default Citation;
