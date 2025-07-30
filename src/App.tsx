import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { JobStatus } from './components/JobStatus';
import { Layers3, Building2 } from 'lucide-react';
import dg2nLogo from './assets/dg2n_logo_wb.png';
import './App.css';

function App() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleUploadSuccess = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  const handleReset = () => {
    setCurrentJobId(null);
  };

  return (
    <div className="dark bg-background min-h-screen text-foreground">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center">
            <img 
              src={dg2nLogo} 
              alt="dg2n" 
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              CAD to 3D - Physical Twin Pipeline
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload your store’s DWG floor plans and instantly generate immersive 3D models — complete with 
              actionable insights on fixtures, zones, and brand layouts. Powered by intelligent 3D CAD automation.
            </p>
          </div>

          {/* Main Interface */}
          <div className="flex justify-center">
            {currentJobId ? (
              <JobStatus jobId={currentJobId} onReset={handleReset} />
            ) : (
              <FileUpload onUploadSuccess={handleUploadSuccess} />
            )}
          </div>

          {/* Features */}
          {!currentJobId && (
            <div className="mt-16 grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                  <Layers3 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">3D Models</h3>
                <p className="text-sm text-muted-foreground">
                  Generate detailed intelligent 3D models for each floor and fixture of your retail space
                </p>
              </div>
              <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Automated Store Intelligence</h3>
                <p className="text-sm text-muted-foreground">
                  Get structured reports with brand zones, fixture locations, and merchandising layouts—no manual tagging required.
                </p>
              </div>
              <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-foreground mb-2">Lightning-Fast 3D Processing</h3>
                <p className="text-sm text-muted-foreground">
                  Our cloud engine processes your files in real-time with smart cleanup, validation, and structured outputs—ready to plug into your workflow.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
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
  )
}

export default App
