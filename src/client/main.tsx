import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
// Self-hosted display face — the woff2 files are bundled into the Worker's
// static assets, so there are no external font requests at runtime.
import "@fontsource-variable/bricolage-grotesque";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
