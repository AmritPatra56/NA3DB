import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "./App.jsx";
import { routes } from "./routes.jsx";
import { attachRouter } from "./address.js";

const router = createBrowserRouter([{ element: <App />, children: routes }]);
attachRouter(router);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
