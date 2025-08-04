import { useState } from 'react';
import { FileUpload } from './FileUpload';
import { JobStatus } from './JobStatus';
import { Layers3, Building2 } from 'lucide-react';

export function CadTo3D() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const handleUploadSuccess = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  const handleReset = () => {
    setCurrentJobId(null);
  };

  return (
    <main className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            CAD to 3D - Physical Twin Pipeline
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your store's DWG floor plans and instantly generate immersive 3D models — complete with 
            actionable insights on fixtures, zones, and brand layouts. Powered by intelligent 3D CAD automation.
          </p>
        </div>

        <div className="flex justify-center">
          {currentJobId ? (
            <JobStatus jobId={currentJobId} onReset={handleReset} />
          ) : (
            <FileUpload onUploadSuccess={handleUploadSuccess} />
          )}
        </div>

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
  );
}