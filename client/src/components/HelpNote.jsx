import { useEffect, useRef } from "react";

// The one "?" on the site (views/includes/help.ejs): a round button that
// opens a short note from help_texts.js. Its owner keeps which note is open,
// so only one is at a time. While open, a click outside it or Escape closes
// it (structure.ejs); Escape puts focus back on its "?". name: which note,
// passed back to onToggle and onClose.
function HelpNote({ name, text, open, onToggle, onClose }) {
  const box = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return;
    const click = (ev) => { if (!box.current.contains(ev.target)) onClose(name); };
    const key = (ev) => {
      if (ev.key !== "Escape") return;
      onClose(name);
      button.current.focus();
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, [open, name, onClose]);

  return (
    <details ref={box} className="help" open={open}>
      <summary ref={button} aria-label="What this section shows" title="What this section shows"
               onClick={(ev) => { ev.preventDefault(); onToggle(name); }}>?</summary>
      <p>{text}</p>
    </details>
  );
}

export default HelpNote;
