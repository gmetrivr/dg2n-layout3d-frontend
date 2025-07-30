import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { JobStatus } from './components/JobStatus';
import { Layers3, Building2 } from 'lucide-react';
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Layers3 className="h-8 w-8 text-primary" />
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">dg2n</h1>
              <p className="text-sm text-muted-foreground">Layout 3D Pipeline</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              Transform Your Store Layouts
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload your DWG floor plans and convert them into interactive 3D models 
              with detailed reports and analysis. Powered by advanced CAD processing.
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
                  Generate detailed 3D GLB models for each floor of your retail space
                </p>
              </div>
              <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Store Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Get comprehensive reports on fixtures, brands, and location mapping
                </p>
              </div>
              <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-foreground mb-2">Fast Processing</h3>
                <p className="text-sm text-muted-foreground">
                  Automated pipeline processes your CAD files efficiently with real-time updates
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
              © 2024 dg2n. Advanced CAD processing for retail spaces.
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
