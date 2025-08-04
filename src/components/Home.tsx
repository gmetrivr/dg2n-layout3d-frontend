import { Link } from 'react-router-dom';
import { Upload, Layers3, Eye, ArrowRight, Building2, Box } from 'lucide-react';

export function Home() {
  return (
    <main className="container mx-auto px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-foreground mb-6">
            dg2n Physical Twin Platform
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Transform your CAD files into intelligent 3D models with advanced visualization and modification capabilities. 
            Streamline your workflow with our comprehensive ZIP-based processing system.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* CAD to 3D Card */}
          <Link
            to="/cad-to-3d"
            className="group relative overflow-hidden rounded-2xl bg-card border border-border p-8 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl group-hover:bg-primary/20 transition-colors">
                  <Layers3 className="h-8 w-8 text-primary" />
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-3">
                CAD to 3D Conversion
              </h2>
              
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Upload your DWG floor plans and automatically generate detailed 3D models. 
                Get comprehensive ZIP packages with GLB models and CSV analytics for each floor and fixture.
              </p>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">DWG Upload</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">ZIP Output</span>
                </div>
              </div>
            </div>
          </Link>

          {/* 3D Viewer Modifier Card */}
          <Link
            to="/3d-viewer-modifier"
            className="group relative overflow-hidden rounded-2xl bg-card border border-border p-8 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl group-hover:bg-primary/20 transition-colors">
                  <Eye className="h-8 w-8 text-primary" />
                </div>
                <ArrowRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-3">
                3D Viewer & Modifier
              </h2>
              
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Visualize and interact with your processed 3D models. View GLB files extracted from ZIP packages, 
                switch between different floors, and analyze CSV reports in an immersive 3D environment.
              </p>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">GLB Viewer</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Interactive</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <h3 className="text-2xl font-semibold text-foreground mb-8">
            How It Works
          </h3>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
                <span className="text-primary font-bold">1</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Upload & Process</h4>
              <p className="text-sm text-muted-foreground">
                Upload your CAD files and let our system automatically generate 3D models and analytics
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
                <span className="text-primary font-bold">2</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Download ZIP</h4>
              <p className="text-sm text-muted-foreground">
                Receive comprehensive ZIP packages containing GLB models and CSV reports
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
                <span className="text-primary font-bold">3</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">View & Modify</h4>
              <p className="text-sm text-muted-foreground">
                Visualize your 3D models and interact with them in our advanced viewer
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}