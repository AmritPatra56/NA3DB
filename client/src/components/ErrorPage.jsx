import { Link } from "react-router";
function ErrorPage({ heading, message }) {
  return (
    <div className="results_area">
      <div className="results_area_header">
        <h1>{heading}</h1>
      </div>
      <div className="results_area_body">
        <div className="empty_state">
          <p className="error_text">{message}</p>
          <Link className="detail_link" to="/search">Back to Full search</Link>
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;
