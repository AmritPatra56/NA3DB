import Rail from "./components/Rail.jsx";
import Landing from "./components/Landing.jsx";
import StructurePage from "./components/StructurePage.jsx";
import SearchPage from "./components/SearchPage.jsx";
import Footer from "./components/Footer.jsx";

// Until React Router (Phase 8): /structure/<id> shows that entry, /search the
// full search, every other path the landing page. Each page asks the server
// for its own data.
const path = window.location.pathname;
const entryId = path.match(/^\/structure\/([^/]+)/)?.[1];

function Page() {
  if (entryId) return <StructurePage id={decodeURIComponent(entryId)} />;
  if (path === "/search") return <SearchPage />;
  return <Landing />;
}

function App() {
  return (
    <>
      <div className="interface">
        <Rail />
        <Page />
      </div>
      <Footer />
    </>
  );
}

export default App;
