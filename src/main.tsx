import { createRoot } from "react-dom/client";
import App from "./App.tsx";

console.log('=== MAIN.TSX EXECUTING ===');

const rootElement = document.getElementById("root");
console.log('Root element:', rootElement);

if (!rootElement) {
  console.error('❌ ROOT ELEMENT NOT FOUND!');
  document.body.innerHTML = '<h1 style="color: red;">ERROR: Root element not found!</h1>';
} else {
  console.log('✅ Root element found, rendering...');
  try {
    createRoot(rootElement).render(<App />);
    console.log('✅ App rendered successfully');
  } catch (error) {
    console.error('❌ Render error:', error);
    document.body.innerHTML = '<h1 style="color: red;">RENDER ERROR: ' + error + '</h1>';
  }
}