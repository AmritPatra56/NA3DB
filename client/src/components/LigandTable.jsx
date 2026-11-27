const none = <span className="molecule_sub">none</span>;

function LigandTable({ rows }) {
  return (
    <>
      <colgroup><col style={{ width: "12%" }} /><col style={{ width: "70%" }} /><col style={{ width: "18%" }} /></colgroup>
      <tbody>
        <tr><th>Code</th><th>Name</th><th>Count</th></tr>
        {rows.map((row) => (
          <tr key={row.code ?? row.name}>
            <td>{row.url ? <a target="_blank" rel="noopener" href={row.url}>{row.code}</a> : row.code ?? none}</td>
            <td>{row.name}</td>
            <td>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

export default LigandTable;
