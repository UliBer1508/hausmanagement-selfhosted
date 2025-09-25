import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register service worker for PWA
import "./registerSW";

createRoot(document.getElementById("root")!).render(<App />);
