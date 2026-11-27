import { useCallback, useState } from "react";

export function useHelp() {
  const [open, setOpen] = useState(null);
  const onToggle = useCallback((name) => setOpen((was) => (was === name ? null : name)), []);
  const onClose = useCallback((name) => setOpen((was) => (was === name ? null : was)), []);
  return { open, onToggle, onClose };
}
