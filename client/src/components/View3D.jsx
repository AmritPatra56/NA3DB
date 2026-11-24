import { useState } from "react";
import ViewSlot from "./ViewSlot.jsx";

// The 3D panel with the viewer: the offer, then the frame. Views decides when
// the frame is made (mounted); this keeps only what the frame itself shows.
function View3D({ pdbId, mounted, onStart }) {
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const src = `/viewer/?embed=1&id=${encodeURIComponent(pdbId)}`;

  return (
    <div className={`view_3d${ready ? " view_3d_ready" : ""}`} data-src={src} data-entry={pdbId}
         data-mounted={mounted ? "1" : undefined}>
      {/* The offer, for when the page selects 3D by itself (task 6.7): the
          download and the annotation wait for this button. style.css hides
          the button once the frame is made. */}
      <ViewSlot view="3d">
        <p className="view_3d_offer">
          {opening ? "Opening the 3D viewer…" : "The model is downloaded and its base pairs annotated in your browser."}
        </p>
        <button type="button" className="view_3d_start"
                onClick={() => { setOpening(true); onStart(); }}>Show the 3D model</button>
      </ViewSlot>
      {/* The waiting words underneath stay until the frame has loaded. */}
      {mounted && <iframe className="view_3d_frame" title={`3D viewer of ${pdbId}`} src={src}
                          onLoad={() => setReady(true)} />}
    </div>
  );
}

export default View3D;
