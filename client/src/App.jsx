import Rail from "./components/Rail.jsx";
import Landing from "./components/Landing.jsx";
import Structure from "./components/Structure.jsx";
import Footer from "./components/Footer.jsx";
import entry119D from "./data/entry_119D.json";
import entry1OLN from "./data/entry_1OLN.json";
import molecules119D from "./data/molecules_119D.json";
import molecules1OLN from "./data/molecules_1OLN.json";

// Until React Router (Phase 8): /structure/119D or /structure/1OLN shows that
// snapshot, every other path the landing page.
const ENTRIES = {
  "119D": { entry: entry119D, molecules: molecules119D },
  "1OLN": { entry: entry1OLN, molecules: molecules1OLN },
};
const shown = ENTRIES[window.location.pathname.match(/^\/structure\/(\w+)/)?.[1]?.toUpperCase()];

function App() {
  return (
    <>
      <div className="interface">
        <Rail />
        {shown ? <Structure entry={shown.entry} molecules={shown.molecules} /> : <Landing />}
      </div>
      <Footer />
    </>
  );
}

export default App;
