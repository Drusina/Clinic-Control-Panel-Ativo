import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
