import { startParetoProof } from "./start-app";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("ParetoProof could not find the web root element.");
}

void startParetoProof(rootElement);
