/**
 * Root component for the Nomenclator Key Reconstructor application.
 * 
 * This is a single-page app that provides a workspace for
 * semi-automatic reconstruction of nomenclator cipher keys.
 */

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
