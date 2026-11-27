import { useState } from "react";
import ViewSlot from "./ViewSlot.jsx";

function View3D({ pdbId, mounted, onStart }) {
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const src = `/viewer/?embed=1&id=${encodeURIComponent(pdbId)}`;

  return (
    <div className={`view_3d${ready ? " view_3d_ready" : ""}`} data-src={src} data-entry={pdbId}
         data-mounted={mounted ? "1" : undefined}>
      <ViewSlot view="3d">
        <p className="view_3d_offer">
          {opening ? "Opening the 3D viewer…" : "The model is downloaded and its base pairs annotated in your browser."}
        </p>
        <button type="button" className="view_3d_start"
                onClick={() => { setOpening(true); onStart(); }}>Show the 3D model</button>
      </ViewSlot>
      {mounted && <iframe className="view_3d_frame" title={`3D viewer of ${pdbId}`} src={src}
                          onLoad={() => setReady(true)} />}
    </div>
  );
}

export default View3D;
