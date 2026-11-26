import { useEffect, useState } from "react";
import { copyText } from "../clipboard.js";

const COPIED_MS = 1500;

// A copy button: copies `text`, then shows a tick and says "Copied" for 1.5 s
// (structure.ejs). children: words after the icon, the citation's "Copy".
function CopyButton({ text, title, className = "sequence_copy", children }) {
  const [copied, setCopied] = useState(false);

  // The tick goes 1.5 s after it came; a page left sooner clears the timer.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleClick() {
    await copyText(text);
    setCopied(true);
  }

  return (
    <button type="button" className={`${className}${copied ? " copied" : ""}`}
            title={copied ? "Copied" : title} aria-label={title} onClick={handleClick}>
      <svg className="icon_copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
      <svg className="icon_done" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      {children}
    </button>
  );
}

export default CopyButton;
