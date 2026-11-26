import { useState } from "react";
import { askedView, keepView } from "../views.js";

// Which view the Views show (views.js show): the reader's pick, else the one
// the section being read asks for (follow), else ?view=. From a pick on, the
// page stops choosing: a view they asked for is not taken away by a scroll.
// mounted: the 3D frame is made. It downloads the model and annotates every
// pair, so it is made only once 3D is asked for, and then kept (mount_3d).
// Opened straight into 3D by ?view=3d it is wanted at once; a scroll that
// opens 3D only offers it.
export function useViewChoice(viewer, follow) {
  const [start] = useState(askedView);
  const [chosen, setChosen] = useState(null);
  const [mounted, setMounted] = useState(() => viewer && start === "3d");

  return {
    open: chosen ?? follow ?? start,
    mounted,
    onShow: (view) => {
      setChosen(view);
      if (view === "3d" && viewer) setMounted(true);
      keepView(view);
    },
    onStart3d: () => {
      setChosen("3d");
      setMounted(true);
    },
  };
}
