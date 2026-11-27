import { useEffect, useState } from "react";
import { recall, remember, forget } from "../remember.js";

const KEY = "na3db-theme";
const NEXT = { auto: "light", light: "dark", dark: "auto" };
const SAYS = {
  auto: "Theme: auto, follows your device",
  light: "Theme: light",
  dark: "Theme: dark",
};

function stored() {
  const t = recall(KEY);
  return t === "light" || t === "dark" ? t : "auto";
}

export function useTheme() {
  const [choice, setChoice] = useState(stored);

  useEffect(() => {
    if (choice === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
  }, [choice]);

  // The storage event only fires in the other tabs.
  useEffect(() => {
    const follow = (e) => {
      if (e.key === KEY) setChoice(stored());
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);

  function onNext() {
    const next = NEXT[choice];
    if (next === "auto") forget(KEY);
    else remember(KEY, next);
    setChoice(next);
  }

  return { choice, label: `${SAYS[choice]}. Switch to ${NEXT[choice]}.`, onNext };
}
