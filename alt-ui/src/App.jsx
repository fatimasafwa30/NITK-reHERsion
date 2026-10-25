import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaseProvider } from './hooks/useCaseStore';
import Layout from './components/layout/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CaseOverview from './pages/CaseOverview';
import EvidenceWorkspace from './pages/EvidenceWorkspace';
import Dossier from './pages/Dossier';

export default function App() {
  return (
    <CaseProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="case/:caseId" element={<CaseOverview />} />
            <Route path="case/:caseId/evidence" element={<EvidenceWorkspace />} />
            <Route path="case/:caseId/dossier" element={<Dossier />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CaseProvider>
  );
}
