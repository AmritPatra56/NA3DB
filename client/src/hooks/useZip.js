import { useState } from "react";
import { getJSON } from "../api.js";
import { exportParams, rowsPath, optionOn } from "../report.js";
import { buildCsv, fastaText, readmeText, excelIds, today, downloadBlob } from "../reportFiles.js";
import { makeZip } from "../zip.js";

// Download all (report.js download_all): every table with every field,
// whatever is ticked, plus the sequences as FASTA, the base pairs as
// dot-bracket and a README. The options in the address decide the rows.
// state: "idle", "busy" (Preparing…) or "failed" (Download failed, try again).
export function useZip({ registry, tables, search, load }) {
  const [state, setState] = useState("idle");

  const onZip = async () => {
    setState("busy");
    try {
      const replies = await Promise.all(tables.map((t) => load(t.key, rowsPath(search, registry, t))));
      const rows = Object.fromEntries(tables.map((t, i) => [t.key, replies[i].results]));
      const asked = exportParams(search, registry).toString();
      const dbn = await getJSON("/api/export/dbn?" + asked);
      const date = today();
      const files = tables.map((t) => ({ name: `${t.key}.csv`, text: buildCsv(t.fields, rows[t.key]) }));
      const on = (key) => optionOn(tables.find((t) => t.option?.key === key), search);
      files.push({ name: "sequences.fasta", text: fastaText(rows.molecules) },
                 { name: "base_pairs.dbn", text: dbn.text },
                 { name: "README.txt", text: readmeText({
                   origin: window.location.origin, search: asked, proteins: on("proteins"), water: on("water"),
                   counts: Object.fromEntries(tables.map((t) => [t.key, rows[t.key].length])), dbn,
                   excel: excelIds(rows.structures.map((r) => r[registry.report_key])), date }) });
      downloadBlob(await makeZip(files), `na3db_report_${date}.zip`);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return { state, onZip };
}
