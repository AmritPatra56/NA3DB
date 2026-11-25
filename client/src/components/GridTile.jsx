import { entryHref, tileFacts } from "../resultCard.js";

// One result as a tile in the Grid view (app.js tile_html): a blank picture
// slot, kept for a snapshot of the 3D structure, then its id, title and one
// line of facts. The whole tile is one link to the structure page.
function GridTile({ entry }) {
  return (
    <a className="grid_tile" data-id={entry.pdb_id} href={entryHref(entry.pdb_id)}>
      <span className="grid_tile_picture" aria-hidden="true"></span>
      <span className="grid_tile_text">
        <b>{entry.pdb_id}</b>
        <span className="grid_tile_title">{entry.title}</span>
        <span className="grid_tile_facts">{tileFacts(entry)}</span>
      </span>
    </a>
  );
}

export default GridTile;
