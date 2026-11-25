// Puts text on the clipboard (structure.ejs). Without clipboard permission
// (an embedded or plain-http page) it copies through a hidden text box.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const box = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(box);
    box.select();
    document.execCommand("copy");
    box.remove();
  }
}
