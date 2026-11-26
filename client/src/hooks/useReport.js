import { useState } from "react";
import { useLocation } from "react-router";
import { replaceAddress } from "../address.js";
import { tableOf, optionOn, firstTicks, rowsPath, withParam, chosenFields } from "../report.js";
import { useRows } from "./useRows.js";
import { useZip } from "./useZip.js";
import { buildCsv, today, downloadBlob } from "../reportFiles.js";

// The report page's state (report.js): the open table and its option come
// from the address, the ticks are kept per table, the rows by useRows.
// registry: /api/fields, never null here.
export function useReport(registry) {
  const { search } = useLocation();
  const tables = registry.report_tables;
  const table = tableOf(tables, search);
  const [ticks, setTicks] = useState(() => firstTicks(tables, registry.report_key));
  const rows = useRows(table.key, rowsPath(search, registry, table));
  const zip = useZip({ registry, tables, search, load: rows.load });

  return {
    tables, table, rows, zip,
    idField: registry.report_key,
    ticks: ticks[table.key],
    option: optionOn(table, search),
    // The first table is the default and goes unsaid.
    onTable: (key) => replaceAddress(withParam(search, "table", key === tables[0].key ? null : key)),
    onOption: (on) => replaceAddress(withParam(search, table.option.key, on ? "1" : null)),
    // The open table's ticked fields, every row.
    onCsv: () => downloadBlob(new Blob([buildCsv(chosenFields(table, ticks[table.key]), rows.data.results)], { type: "text/csv;charset=utf-8" }),
                              `na3db_${table.key}_${today()}.csv`),
    onTick: (field, on) => setTicks((was) => ({
      ...was, [table.key]: on ? [...was[table.key], field] : was[table.key].filter((k) => k !== field),
    })),
  };
}
