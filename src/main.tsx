import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/layout.css";
import "./styles/servers.css";
import "./styles/channels.css";
import "./styles/messages.css";
import "./styles/members.css";
import "./styles/voice.css";
import "./styles/settings.css";

// Apply saved theme overrides on load
import "./utils/theme";

// Disable default browser context menu globally
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
