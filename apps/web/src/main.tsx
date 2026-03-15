import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { readWebRuntimeEnv } from "./lib/runtime-env";
import "./styles/app.css";

readWebRuntimeEnv();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
