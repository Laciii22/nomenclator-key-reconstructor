/**
 * Root component for the Nomenclator Key Reconstructor application.
 * 
 * This is a single-page app that provides a workspace for
 * semi-automatic reconstruction of nomenclator cipher keys.
 */

import './App.css';
import NomenclatorPage from './pages/NomenclatorPage';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NomenclatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
