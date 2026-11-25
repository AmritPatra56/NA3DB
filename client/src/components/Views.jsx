import { useState } from "react";
import ViewTiles from "./ViewTiles.jsx";
import ViewSlot from "./ViewSlot.jsx";
import View3D from "./View3D.jsx";
import { askedView, keepView } from "../views.js";

// views.ejs: 1D, 2D and 3D tiles over one panel each, one open at a time.
// Views owns which view the reader chose and whether the 3D frame is made;
// the rest show it. follow: the view the section being read asks for.
function Views({ pdbId, viewer, follow }) {
  const [start] = useState(askedView);
  // The view the reader picked. From then on the page stops choosing for
  // them: a view they asked for must not be taken away by the next scroll.
  const [chosen, setChosen] = useState(null);
  // The 3D frame downloads the model and annotates every pair in WebAssembly,
  // so it is made only once 3D is asked for, and then kept (views.js mount_3d):
  // a second click must not restart a run that may be minutes old.
  // Opened straight into 3D by ?view=3d, it is wanted at once. A scroll that
  // opens 3D only offers it.
  const [mounted, setMounted] = useState(() => viewer && start === "3d");
  const open = chosen ?? follow ?? start;

  function show(view) {
    setChosen(view);
    if (view === "3d" && viewer) setMounted(true);
    keepView(view);
  }

  return (
    <div className="views">
      <ViewTiles open={open} onShow={show} />
      <div className="view_panel" role="tabpanel" id="view-1d" aria-labelledby="view-1d-tab" hidden={open !== "1d"}>
        {/* The 1D lines are fetched and drawn by views.js on the EJS site; here they come with task 8.3. */}
        <div className="lbn" data-entry={pdbId}>
          <p className="seqmap_wait">Reading the base pairs…</p>
        </div>
        <p className="lbn_more">The <a href="#sequence-map">Sequence map</a> adds the backbone steps and lets you pick other strands.</p>
      </div>
      <div className="view_panel" role="tabpanel" id="view-2d" aria-labelledby="view-2d-tab" hidden={open !== "2d"}>
        <ViewSlot view="2d"><p>The 2D diagram of the secondary structure will be shown here.</p></ViewSlot>
      </div>
      <div className="view_panel" role="tabpanel" id="view-3d" aria-labelledby="view-3d-tab" hidden={open !== "3d"}>
        {viewer
          ? <View3D pdbId={pdbId} mounted={mounted} onStart={() => { setChosen("3d"); setMounted(true); }} />
          : <ViewSlot view="3d"><p>The 3D viewer of the structure will be shown here.</p></ViewSlot>}
      </div>
    </div>
  );
}

export default Views;
