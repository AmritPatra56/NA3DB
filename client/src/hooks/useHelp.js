import { useCallback, useState } from "react";

// Which "?" note of a page is open, so only one is at a time (structure.ejs).
// onClose(name) closes that note only, so a click that opens another note
// is not undone by the one it closes.
export function useHelp() {
  const [open, setOpen] = useState(null);
  const onToggle = useCallback((name) => setOpen((was) => (was === name ? null : name)), []);
  const onClose = useCallback((name) => setOpen((was) => (was === name ? null : was)), []);
  return { open, onToggle, onClose };
}
