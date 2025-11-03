
import './App.css';
import HomePage from './pages/HomePage';
import NomenklatorPage from './pages/NomenklatorPage';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/nomenklator" element={<NomenklatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
