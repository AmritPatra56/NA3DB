import Rail from "./components/Rail.jsx";
import Landing from "./components/Landing.jsx";
import StructurePage from "./components/StructurePage.jsx";
import SearchPage from "./components/SearchPage.jsx";
import { useState } from "react";
import Footer from "./components/Footer.jsx";
import { routeOf, railOf } from "./route.js";
import { here } from "./address.js";

// Each page asks the server for its own data.
const route = routeOf(here().path);

// onAddress: the search page's address changed. onFailed: the page shows an error.
function Page({ onAddress, onFailed }) {
  if (route.name === "structure") return <StructurePage id={route.id} onFailed={onFailed} />;
  if (route.name === "search") return <SearchPage onAddress={onAddress} />;
  return <Landing />;
}

function App() {
  // The search the rail's links carry, so going back to it from another page
  // keeps it: the search page's address, as it last wrote it.
  const [railSearch, setRailSearch] = useState(route.name === "search" ? here().search : "");
  // The page in view shows an error instead (error.ejs).
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div className="interface">
        <Rail {...railOf(failed ? { name: "error" } : route, railSearch)} />
        <Page onAddress={setRailSearch} onFailed={setFailed} />
      </div>
      <Footer />
    </>
  );
}

export default App;
