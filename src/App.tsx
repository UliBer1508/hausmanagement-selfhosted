// Minimal App without any complex dependencies
import Index from "./pages/Index";

console.log('Minimal App loading...');

const App = () => {
  console.log('Minimal App rendering...');
  return <Index />;
};

export default App;