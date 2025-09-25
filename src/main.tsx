import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log('main.tsx loading...');

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
  console.log('App rendered successfully');
}