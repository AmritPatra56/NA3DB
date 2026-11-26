import { useState } from "react";
import { remembered, remember } from "../remember.js";

// A yes/no choice kept for the next page under key, stored as the word yes
// or no (the nav fold, the Views width): the choice and its toggle.
export function useRemembered(key, yes, no) {
  const [on, setOn] = useState(() => remembered(key, yes));
  function onToggle() {
    remember(key, on ? no : yes);
    setOn(!on);
  }
  return [on, onToggle];
}
