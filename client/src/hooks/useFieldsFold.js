import { useState } from "react";
import { useLocation } from "react-router";
import { useMedia } from "./useMedia.js";
import { replaceAddress } from "../address.js";
import { withParam } from "../report.js";
import { PHONE } from "../constants.js";

// The report's field list, open or folded (report.js set_fields). It starts
// as ?fields= says; on a phone, twenty boxes would push the table off the
// screen, so there it starts shut unless the link says otherwise. Then it is
// the reader's: the choice goes in the address, so a shared link opens the
// way it was left. Open is unsaid beside the table (the default) but said on
// a phone, where it is not.
export function useFieldsFold() {
  const { search } = useLocation();
  const phone = useMedia(PHONE);
  const [open, setOpen] = useState(() => {
    const asked = new URLSearchParams(search).get("fields");
    return asked !== "closed" && !(phone && asked === null);
  });

  return {
    open,
    // Out of sight beside the table, the panel leaves the tab order; on a
    // phone the Download buttons stay, and the list is gone anyway.
    inert: !open && !phone,
    label: open ? "Hide the fields" : "Show the fields",
    onToggle: () => {
      setOpen(!open);
      replaceAddress(withParam(search, "fields", open ? "closed" : phone ? "open" : null));
    },
  };
}
