import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import "./styles.css";

/*
|--------------------------------------------------------------------------
| Owner Trading — Application Entry
|--------------------------------------------------------------------------
|
| This is the single frontend entry point.
|
| Responsibilities:
|   • Mount the React application
|   • Load the global stylesheet
|   • Enable React Strict Mode during development
|
| Application logic does NOT belong here.
|
| Architecture:
|
|   index.jsx
|       ↓
|   App.jsx
|       ↓
|   context.jsx
|       ↓
|   pages / components
|
|--------------------------------------------------------------------------
*/

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "Owner Trading could not start because the root element (#root) was not found."
  );
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
