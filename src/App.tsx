import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { CadTo3D } from './components/CadTo3D';
import { ThreeDViewerModifier } from './components/3DViewerModifier';
import dg2nLogo from './assets/dg2n_logo_wb.png';
import './App.css';

function App() {
  return (
    <Router>
      <div className="dark bg-background min-h-screen text-foreground">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <Link to="/cad-to-3d">
                <img 
                  src={dg2nLogo} 
                  alt="dg2n" 
                  className="h-12 w-auto object-contain"
                />
              </Link>
              <nav className="flex items-center gap-6">
                <Link 
                  to="/cad-to-3d" 
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  CAD to 3D
                </Link>
                <Link 
                  to="/3d-viewer-modifier" 
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  3D Viewer Modifier
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <Routes>
<<<<<<< HEAD
          <Route path="/" element={<Navigate to="/cad-to-3d" replace />} />
          <Route path="/cad-to-3d" element={<CadTo3D />} />
=======
          <Route path="/cad-to-3d" index element={<CadTo3D />} />
>>>>>>> 4ebcc4ee325f7093b61534611ea35ae5e9823750
          <Route path="/3d-viewer-modifier" element={<ThreeDViewerModifier />} />
        </Routes>

        <footer className="border-t border-border mt-auto">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                © 2025 dg2n | Physical Twin
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Powered by</span>
                <span className="font-medium text-primary">dg2n</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  )
}

export default App
