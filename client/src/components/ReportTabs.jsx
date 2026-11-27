import { useRef } from "react";

function ReportTabs({ tables, current, onTable }) {
  const tabs = useRef([]);
  const key = (e, at) => {
    const n = { ArrowRight: (at + 1) % tables.length, ArrowLeft: (at - 1 + tables.length) % tables.length,
                Home: 0, End: tables.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    tabs.current[n].focus();
    onTable(tables[n].key);
  };
  return (
    <div className="report_tabs" role="tablist" aria-label="Report tables">
      {tables.map((t, at) => (
        <button key={t.key} ref={(el) => { tabs.current[at] = el; }} type="button" className="report_tab" role="tab"
                id={`table-${t.key}`} data-table={t.key} aria-controls="report_fields" aria-selected={t.key === current}
                tabIndex={t.key === current ? undefined : -1}
                onClick={() => onTable(t.key)} onKeyDown={(e) => key(e, at)}>{t.name}</button>
      ))}
    </div>
  );
}

export default ReportTabs;
