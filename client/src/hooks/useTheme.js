import { useEffect, useState } from "react";
import { recall, remember, forget } from "../remember.js";

// The rail's theme (public/theme.js): Auto (follow the device), Light, Dark,
// in turn. Same storage key as the EJS site, so both remember one choice.
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
  // A function, not stored(): React calls it once, on the first render only.
  const [choice, setChoice] = useState(stored);

  // <html> is outside React's #root, so the choice is set on it here.
  useEffect(() => {
    if (choice === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
  }, [choice]);

  // Another tab changed it: follow. The browser only tells the other tabs.
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
