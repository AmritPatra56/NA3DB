import { useState } from "react";
import { askedView, keepView } from "../views.js";

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
