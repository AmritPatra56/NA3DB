import { useMemo, useState } from "react";
import { FIT, frameOf, layoutOf, litOf, panTo, zoomBy } from "../arcView.js";

export function useArcView(d, size) {
  const [sel, setSel] = useState({ hover: null, picked: null });
  const [fam, setFam] = useState(null);
  const [zoom, setZoom] = useState({ at: "", ...FIT });

  const f = d?.pairs.length && size ? frameOf(size.width, size.height, d) : null;
  const at = f ? `${f.W} ${f.H}` : "";
  const W = f?.W;
  const L = useMemo(() => (W ? layoutOf(d, W) : null), [d, W]);
  const z = zoom.at === at ? zoom : FIT;
  const on = sel.hover ?? sel.picked;

  return {
    f, L, z, on, fam,
    lit: d ? litOf(d, on, fam) : null,
    onHover: (i) => setSel((was) => (was.hover === i ? was : { ...was, hover: i })),
    onPick: (i) => setSel((was) => ({ hover: null, picked: was.picked === i ? null : i })),
    onFamily: (name) => {
      setFam((was) => (was === name ? null : name));
      setSel((was) => ({ ...was, picked: null }));
    },
    // From the current zoom, so two wheel turns before a redraw make two steps.
    onZoom: (by, cx = f.W / 2) => setZoom((was) => ({ at, ...zoomBy(was.at === at ? was : FIT, by, cx, L, f.W) })),
    onPan: (tx) => setZoom((was) => ({ at, ...panTo(was.at === at ? was : FIT, tx, f.W) })),
    onFit: () => setZoom({ at, ...FIT }),
  };
}
