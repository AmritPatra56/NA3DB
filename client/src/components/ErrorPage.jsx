// error.ejs: a heading, one line saying what happened, and a way on.
function ErrorPage({ heading, message }) {
  return (
    <div className="results_area">
      <div className="results_area_header">
        <h1>{heading}</h1>
      </div>
      <div className="results_area_body">
        <div className="empty_state">
          <p className="error_text">{message}</p>
          <a className="detail_link" href="/search">Back to Full search</a>
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;
