import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Login from './pages/Login';
import Projekte from './pages/Projekte';
import ProjektDetail from './pages/ProjektDetail';
import Toasts from './components/Toasts';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Projekte />} />
        <Route path="/projekt/:id" element={<ProjektDetail />} />
      </Routes>
      <Toasts />
    </BrowserRouter>
  </React.StrictMode>,
);
