import { useEffect, useRef, useState } from "react";

// A download button that opens a short list of files (the FASTA menu, Save
// reference). It shuts once a file is picked or a click lands elsewhere.
function DownloadMenu({ className = "", label, title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const click = (e) => {
      if (!ref.current.contains(e.target) || e.target.closest("a")) setOpen(false);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [open]);

  return (
    <details ref={ref} className={`entry_fasta${className && ` ${className}`}`} open={open}>
      <summary className="download download_small" title={title}
               onClick={(e) => { e.preventDefault(); setOpen(!open); }}>{label}</summary>
      <div className="entry_fasta_menu">{children}</div>
    </details>
  );
}

export default DownloadMenu;
