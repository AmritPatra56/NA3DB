import { useState } from "react";
import { useLocation } from "react-router";
import { useMedia } from "./useMedia.js";
import { replaceAddress } from "../address.js";
import { withParam } from "../report.js";
import { PHONE } from "../constants.js";

// Starts folded on a phone, where the boxes would push the table off screen.
export function useFieldsFold() {
  const { search } = useLocation();
  const phone = useMedia(PHONE);
  const [open, setOpen] = useState(() => {
    const asked = new URLSearchParams(search).get("fields");
    return asked !== "closed" && !(phone && asked === null);
  });

  return {
    open,
    inert: !open && !phone,
    label: open ? "Hide the fields" : "Show the fields",
    onToggle: () => {
      setOpen(!open);
      replaceAddress(withParam(search, "fields", open ? "closed" : phone ? "open" : null));
    },
  };
}
