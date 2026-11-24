import { useState } from "react";
import { recall, remember, forget } from "../remember.js";

// The theme button in the rail: Auto (follow the device), Light, Dark, in turn.
// Same storage key as the EJS site, so both remember one choice.
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

function ThemeButton() {
  // A function, not stored(): React calls it once, on the first render only.
  const [choice, setChoice] = useState(stored);

  function handleClick() {
    const next = NEXT[choice];
    if (next === "auto") forget(KEY);
    else remember(KEY, next);
    // <html> is outside React's #root, so the click sets it directly.
    if (next === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    setChoice(next);
  }

  const label = `${SAYS[choice]}. Switch to ${NEXT[choice]}.`;
  return (
    <button type="button" className="rail-item rail-theme" data-choice={choice}
            title={label} aria-label={label} onClick={handleClick}>
      <svg className="theme_auto" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>
      <svg className="theme_light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      <svg className="theme_dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
    </button>
  );
}

export default ThemeButton;
