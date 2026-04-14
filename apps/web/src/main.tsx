import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

console.log("[BOOT] main.tsx loaded");

const rootEl = document.getElementById("root");
console.log("[BOOT] rootEl:", rootEl);

if (!rootEl) {
  document.body.innerHTML = "<pre>ERROR: #root element not found in index.html</pre>";
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
