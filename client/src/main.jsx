import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "./App.jsx";
import { routes } from "./routes.jsx";
import { attachRouter } from "./address.js";

// One route per page under App, which draws the rail and the footer round
// whichever page the address picks.
const router = createBrowserRouter([{ element: <App />, children: routes }]);
attachRouter(router);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
