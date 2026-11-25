import Rail from "./components/Rail.jsx";
import Landing from "./components/Landing.jsx";
import StructurePage from "./components/StructurePage.jsx";
import SearchPage from "./components/SearchPage.jsx";
import { useState } from "react";
import Footer from "./components/Footer.jsx";

// Until React Router (Phase 8): /structure/<id> shows that entry, /search the
// full search, every other path the landing page. Each page asks the server
// for its own data.
const path = window.location.pathname;
const entryId = path.match(/^\/structure\/([^/]+)/)?.[1];

// onAddress: the search page's address changed.
function Page({ onAddress }) {
  if (entryId) return <StructurePage id={decodeURIComponent(entryId)} />;
  if (path === "/search") return <SearchPage onAddress={onAddress} />;
  return <Landing />;
}

function App() {
  // The search the rail's search link carries, so going back to it from
  // another page keeps it: the search page's address, as it last wrote it.
  const [railSearch, setRailSearch] = useState(path === "/search" ? window.location.search : "");
  return (
    <>
      <div className="interface">
        <Rail search={railSearch} />
        <Page onAddress={setRailSearch} />
      </div>
      <Footer />
    </>
  );
}

export default App;
