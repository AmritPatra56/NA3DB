import ViewTiles from "./ViewTiles.jsx";
import ViewSlot from "./ViewSlot.jsx";
import View3D from "./View3D.jsx";
import OneD from "./OneD.jsx";

function Views({ pdbId, viewer, choice, pin, tableRows, onFindRow }) {
  const { open, mounted } = choice;

  return (
    <div className="views">
      <ViewTiles open={open} onShow={choice.onShow} />
      <div className="view_panel" role="tabpanel" id="view-1d" aria-labelledby="view-1d-tab" hidden={open !== "1d"}>
        <OneD pdbId={pdbId} pin={pin} tableRows={tableRows} onFindRow={onFindRow} />
        <p className="lbn_more">The <a href="#sequence-map">Sequence map</a> adds the backbone steps and lets you pick other strands.</p>
      </div>
      <div className="view_panel" role="tabpanel" id="view-2d" aria-labelledby="view-2d-tab" hidden={open !== "2d"}>
        <ViewSlot view="2d"><p>The 2D diagram of the secondary structure will be shown here.</p></ViewSlot>
      </div>
      <div className="view_panel" role="tabpanel" id="view-3d" aria-labelledby="view-3d-tab" hidden={open !== "3d"}>
        {viewer
          ? <View3D pdbId={pdbId} mounted={mounted} onStart={choice.onStart3d} />
          : <ViewSlot view="3d"><p>The 3D viewer of the structure will be shown here.</p></ViewSlot>}
      </div>
    </div>
  );
}

export default Views;
