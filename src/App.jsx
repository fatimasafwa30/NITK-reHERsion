import { Routes, Route } from 'react-router-dom';
import MarketingLayout from './layouts/MarketingLayout';
import AppLayout from './layouts/AppLayout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CaseOverview from './pages/CaseOverview';
import EvidenceWorkspace from './pages/EvidenceWorkspace';
import Dossier from './pages/Dossier';

/* URLs are unchanged — the layout routes only decide which shell wraps
   each page (marketing chrome for the landing page, app shell with
   sidebar for everything behind it). */
export default function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
      </Route>

      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/case/:caseId" element={<CaseOverview />} />
        <Route path="/case/:caseId/evidence" element={<EvidenceWorkspace />} />
        <Route path="/case/:caseId/dossier" element={<Dossier />} />
      </Route>
    </Routes>
  );
}
