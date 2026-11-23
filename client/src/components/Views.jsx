import { useState } from "react";

// views.ejs: 1D, 2D and 3D tiles over one panel each, one open at a time.
const TILES = [
  { key: "1d", name: "1D", what: "Sequence and base pairs",
    glyph: <><path d="M4 7h40M4 17h40"/><path className="view_pair" d="M10 7v10M20 7v10M30 7v10"/></> },
  { key: "2d", name: "2D", what: "Secondary structure",
    glyph: <><path d="M20 24V12M28 24V12"/><circle cx="24" cy="7" r="5"/><path className="view_pair" d="M20 20h8M20 15h8"/></> },
  { key: "3d", name: "3D", what: "Model in space",
    glyph: <><path d="M12 2c24 4 24 16 0 20"/><path className="view_pair" d="M36 2c-24 4-24 16 0 20"/></> },
];
const FIRST = TILES[0].key;

// ?view= in the address picks the open tile, as server.js asked_view does.
function askedView() {
  const asked = new URLSearchParams(location.search).get("view");
  return TILES.some((t) => t.key === asked) ? asked : FIRST;
}

// The tile an arrow key moves to (views.js next_tile): arrows wrap, Home and End go to the ends.
function nextTile(key, at) {
  switch (key) {
    case "ArrowRight": return (at + 1) % TILES.length;
    case "ArrowLeft": return (at - 1 + TILES.length) % TILES.length;
    case "Home": return 0;
    case "End": return TILES.length - 1;
    default: return null;
  }
}

function Views({ pdbId }) {
  const [open, setOpen] = useState(askedView);

  function show(view) {
    setOpen(view);
    // Keep the choice in the address, so a reload or a shared link opens it too.
    // The first view is the default and leaves no ?view=.
    const url = new URL(location.href);
    if (view === FIRST) url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }

  function handleKeyDown(e, at) {
    const n = nextTile(e.key, at);
    if (n === null) return;
    e.preventDefault();
    e.currentTarget.parentElement.children[n].focus();
    show(TILES[n].key);
  }

  return (
    <div className="views">
      <div className="view_tiles" role="tablist" aria-label="Views of the nucleic acids">
        {TILES.map((t, at) => (
          <button type="button" className="view_tile" role="tab" key={t.key}
                  id={`view-${t.key}-tab`} data-view={t.key} aria-controls={`view-${t.key}`}
                  aria-selected={t.key === open} tabIndex={t.key === open ? 0 : -1}
                  onClick={() => show(t.key)} onKeyDown={(e) => handleKeyDown(e, at)}>
            <svg className="view_glyph" viewBox="0 0 48 24" aria-hidden="true">{t.glyph}</svg>
            <span className="view_name">{t.name}</span><span className="view_what">{t.what}</span>
          </button>
        ))}
      </div>
      <div className="view_panel" role="tabpanel" id="view-1d" aria-labelledby="view-1d-tab" hidden={open !== "1d"}>
        {/* The 1D lines are fetched and drawn by views.js on the EJS site; here they come with task 8.3. */}
        <div className="lbn" data-entry={pdbId}>
          <p className="seqmap_wait">Reading the base pairs…</p>
        </div>
        <p className="lbn_more">The <a href="#sequence-map">Sequence map</a> adds the backbone steps and lets you pick other strands.</p>
      </div>
      <div className="view_panel" role="tabpanel" id="view-2d" aria-labelledby="view-2d-tab" hidden={open !== "2d"}>
        <div className="view_slot">
          <svg className="view_slot_glyph" viewBox="0 0 48 24" aria-hidden="true">{TILES[1].glyph}</svg>
          <p>The 2D diagram of the secondary structure will be shown here.</p>
        </div>
      </div>
      <div className="view_panel" role="tabpanel" id="view-3d" aria-labelledby="view-3d-tab" hidden={open !== "3d"}>
        <div className="view_slot">
          <svg className="view_slot_glyph" viewBox="0 0 48 24" aria-hidden="true">{TILES[2].glyph}</svg>
          <p>The 3D viewer of the structure will be shown here.</p>
        </div>
      </div>
    </div>
  );
}

export default Views;
