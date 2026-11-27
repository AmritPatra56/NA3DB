import { useState } from "react";
import { remembered, remember } from "../remember.js";

export function useRemembered(key, yes, no) {
  const [on, setOn] = useState(() => remembered(key, yes));
  function onToggle() {
    remember(key, on ? no : yes);
    setOn(!on);
  }
  return [on, onToggle];
}
