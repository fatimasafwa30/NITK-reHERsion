import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CaseOverview from './pages/CaseOverview';
import EvidenceWorkspace from './pages/EvidenceWorkspace';

export default function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/case/:caseId" element={<CaseOverview />} />
          <Route path="/case/:caseId/evidence" element={<EvidenceWorkspace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
