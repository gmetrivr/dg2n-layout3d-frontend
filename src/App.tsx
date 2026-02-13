import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

import './App.css';
import Navbar from './components/Navbar';
import { AuthGate } from './components/AuthGate';
import { Home } from './components/Home';
import { CadTo3D } from './components/CadTo3D';
import { MyCreatedStores } from './components/MyCreatedStores';
import { Jobs } from './components/Jobs';
import { AuthProvider } from './contexts/AuthContext';
import { StoreProvider } from './contexts/StoreContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Lazy load the heavy 3D viewer component
const ThreeDViewerModifier = lazy(() =>
  import('./components/3DViewerModifier').then(module => ({
    default: module.ThreeDViewerModifier
  }))
);

// Lazy load the 2D store layout page
const StoreLayout = lazy(() =>
  import('./components/StoreLayout/StoreLayout').then(module => ({
    default: module.StoreLayout
  }))
);

// Lazy load QR fixture redirect
const QrFixtureRedirect = lazy(() =>
  import('./components/QrFixtureRedirect').then(module => ({
    default: module.QrFixtureRedirect
  }))
);

function LoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <ThemeProvider>
          <Router>
            <AuthGate>
              <div className="bg-background min-h-screen text-foreground relative">
                <Navbar />
                <div className="pt-24" />

            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/cad-to-3d" element={<CadTo3D />} />
                <Route path="/3d-viewer-modifier" element={<ThreeDViewerModifier />} />
                <Route path="/my-stores" element={<MyCreatedStores />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/layout/:store_id" element={<StoreLayout />} />
                <Route path="/layout/:store_id/view" element={<StoreLayout />} />
                <Route path="/qr/:payload" element={<QrFixtureRedirect />} />
              </Routes>
            </Suspense>

            <footer className="border-t border-border mt-auto">
              <div className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Ac 2025 dg2n | Physical Twin</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Powered by</span>
                    <span className="font-medium text-primary">dg2n</span>
                  </div>
                </div>
              </div>
            </footer>
            </div>
          </AuthGate>
        </Router>
        </ThemeProvider>
      </StoreProvider>
    </AuthProvider>
  );
}

export default App;