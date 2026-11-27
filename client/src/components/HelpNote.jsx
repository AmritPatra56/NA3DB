import { useEffect, useRef } from "react";

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
