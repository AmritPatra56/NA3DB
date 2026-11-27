import { Fragment } from "react";
import { noteParts } from "../searchNote.js";

function SearchNote({ reply, onPhrase }) {
  const parts = reply ? noteParts(reply) : [];
  return (
    <p className={parts.length ? "search_note" : "search_note hidden"} aria-live="polite">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {part.exact && <><span className="note_tag">Exact phrase</span> Whole words, in the order typed.</>}
          {part.phrase && <>Words matched anywhere, in any order. <button type="button" className="link_button"
            data-phrase={part.phrase} onClick={() => onPhrase(part.phrase)}>Search {part.phrase} as an exact phrase</button></>}
          {part.storedAs && `The PDB stores authors as family name and initials, so this also looks for ${part.storedAs}`}
        </Fragment>
      ))}
    </p>
  );
}

export default SearchNote;
