import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import './App.css';
import Navbar from './components/Navbar';
import { AuthGate } from './components/AuthGate';
import { Home } from './components/Home';
import { CadTo3D } from './components/CadTo3D';
import { ThreeDViewerModifier } from './components/3DViewerModifier';
import { MyCreatedStores } from './components/MyCreatedStores';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGate>
          <div className="dark bg-background min-h-screen text-foreground">
            <Navbar />
            <div className="pt-24" />

            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cad-to-3d" element={<CadTo3D />} />
              <Route path="/3d-viewer-modifier" element={<ThreeDViewerModifier />} />
              <Route path="/my-stores" element={<MyCreatedStores />} />
            </Routes>

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
    </AuthProvider>
  );
}

export default App;