
import './App.css';
import NomenklatorPage from './pages/NomenklatorPage';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NomenklatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
