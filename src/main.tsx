import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { configureApplication } from "./application";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("VKab needs a root element to start.");
}

const Application = configureApplication(import.meta.env);

createRoot(rootElement).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
