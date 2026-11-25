import { pageNumbers } from "../pages.js";

// The arrows and page buttons under the results (app.js render_pagination).
// page, pages: from the server's reply; pages null before the first one.
// onPage(n): asks SearchPage for page n. One page or none hides the bar.
function Pagination({ page, pages, onPage }) {
  if (pages === null) return <div className="pagination"></div>;
  if (pages <= 1) return <div className="pagination hidden"></div>;

  return (
    <div className="pagination">
      <button type="button" className="page_arrow" data-page={page - 1} disabled={page === 1}
              onClick={() => onPage(page - 1)}>←</button>
      {pageNumbers(page, pages).map((p, i) => (p === "..."
        ? <span className="page_dots" key={"gap" + i}>…</span>
        : <button type="button" className={`page_num ${p === page ? "active" : ""}`} data-page={p} key={p}
                  onClick={() => onPage(p)}>{p}</button>
      ))}
      <button type="button" className="page_arrow" data-page={page + 1} disabled={page === pages}
              onClick={() => onPage(page + 1)}>→</button>
    </div>
  );
}

export default Pagination;
