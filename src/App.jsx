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
import { EvidenceCapture } from './pages/EvidenceCapture';
import { EvidenceStudio } from './pages/EvidenceStudio';
import { IntegrityAssessment } from './pages/IntegrityAssessment';
import { CrossPlatformAnalysis } from './pages/CrossPlatformAnalysis';
import { CaseTimeline } from './pages/CaseTimeline';
import { ChainOfCustody } from './pages/ChainOfCustody';
import { Dossier } from './pages/Dossier';
import { CaseSafetySettings } from './pages/CaseSafetySettings';
import { Verifier } from './pages/Verifier';
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
        <Route path="case/:caseId/capture" element={<EvidenceCapture />} />
        <Route path="case/:caseId/evidence" element={<EvidenceStudio />} />
        <Route path="case/:caseId/integrity" element={<IntegrityAssessment />} />
        <Route path="case/:caseId/analysis" element={<CrossPlatformAnalysis />} />
        <Route path="case/:caseId/timeline" element={<CaseTimeline />} />
        <Route path="case/:caseId/chain-of-custody" element={<ChainOfCustody />} />
        <Route path="case/:caseId/dossier" element={<Dossier />} />
        <Route path="case/:caseId/safety" element={<CaseSafetySettings />} />
        <Route path="verify" element={<Verifier />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
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
