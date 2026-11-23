import { useState } from "react";

// A copy button: copies `text`, then shows a tick and says "Copied" for 1.5 s
// (structure.ejs). The citation's copy button (task 8.4) will use it too.
function CopyButton({ text, title, className = "sequence_copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard permission (an embedded or plain-http page):
      // copy through a hidden text box instead.
      const box = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={`${className}${copied ? " copied" : ""}`}
            title={copied ? "Copied" : title} aria-label={title} onClick={handleClick}>
      <svg className="icon_copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
      <svg className="icon_done" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
    </button>
  );
}

export default CopyButton;
