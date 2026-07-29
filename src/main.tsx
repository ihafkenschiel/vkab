import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ConfiguredApplication } from "./application";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("VKab needs a root element to start.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ConfiguredApplication environment={import.meta.env} />
  </StrictMode>,
);
