import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/theme.css";
import "./styles/readability-guard.css";
import "./styles/owner-application-audit.css";
import { PublicPreviewProvider } from "./publicPreview/PublicPreviewContext";


const rootEl = document.getElementById("root");

if (!rootEl) {
  document.body.innerHTML = "<pre>ERROR: #root element not found in index.html</pre>";
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <PublicPreviewProvider>
      <App />
    </PublicPreviewProvider>
  </React.StrictMode>
);
