import Rail from "./components/Rail.jsx";
import Landing from "./components/Landing.jsx";
import StructurePage from "./components/StructurePage.jsx";
import Footer from "./components/Footer.jsx";

// Until React Router (Phase 8): /structure/<id> shows that entry, every other
// path the landing page. Each page asks the server for its own data.
const entryId = window.location.pathname.match(/^\/structure\/([^/]+)/)?.[1];

function App() {
  return (
    <>
      <div className="interface">
        <Rail />
        {entryId ? <StructurePage id={decodeURIComponent(entryId)} /> : <Landing />}
      </div>
      <Footer />
    </>
  );
}

export default App;
