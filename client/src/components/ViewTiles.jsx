import ViewGlyph from "./ViewGlyph.jsx";
import { TILES, nextTile } from "../views.js";

function ViewTiles({ open, onShow }) {
  function handleKeyDown(e, at) {
    const n = nextTile(e.key, at);
    if (n === null) return;
    e.preventDefault();
    e.currentTarget.parentElement.children[n].focus();
    onShow(TILES[n].key);
  }

  return (
    <div className="view_tiles" role="tablist" aria-label="Views of the nucleic acids">
      {TILES.map((t, at) => (
        <button type="button" className="view_tile" role="tab" key={t.key}
                id={`view-${t.key}-tab`} data-view={t.key} aria-controls={`view-${t.key}`}
                aria-selected={t.key === open} tabIndex={t.key === open ? 0 : -1}
                onClick={() => onShow(t.key)} onKeyDown={(e) => handleKeyDown(e, at)}>
          <ViewGlyph view={t.key} className="view_glyph" />
          <span className="view_name">{t.name}</span><span className="view_what">{t.what}</span>
        </button>
      ))}
    </div>
  );
}

export default ViewTiles;
