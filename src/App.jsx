import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { VeraStoreProvider } from './store/VeraStore';
import { ToastProvider } from './store/ToastProvider';
import { TooltipProvider } from './components/ui/Tooltip';
import { useGlobalQuickExit } from './components/QuickExit';
import { MarketingShell } from './components/MarketingShell';
import { AppShell } from './components/AppShell';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { CaseOverview } from './pages/CaseOverview';
import { EvidenceStudio } from './pages/EvidenceStudio';
import { CrossPlatformAnalysis } from './pages/CrossPlatformAnalysis';
import { Verifier } from './pages/Verifier';
import { Dossier } from './pages/Dossier';
import { NotFound } from './pages/NotFound';

function Shell() {
  // Escape is a safety control before it is anything else.
  useGlobalQuickExit();

  return (
    <Routes>
      <Route element={<MarketingShell />}>
        <Route index element={<Landing />} />
      </Route>
      <Route element={<AppShell />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="case/:caseId" element={<CaseOverview />} />
        <Route path="case/:caseId/evidence" element={<EvidenceStudio />} />
        <Route path="case/:caseId/analysis" element={<CrossPlatformAnalysis />} />
        <Route path="case/:caseId/dossier" element={<Dossier />} />
        <Route path="verify" element={<Verifier />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    // `reducedMotion="user"` makes the library drop every transform animation
    // when the system asks for less motion, leaving opacity only.
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <VeraStoreProvider>
          <ToastProvider>
            <TooltipProvider>
              <Shell />
            </TooltipProvider>
          </ToastProvider>
        </VeraStoreProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}

export default App;
