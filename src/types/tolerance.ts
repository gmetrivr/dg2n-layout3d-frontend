export interface ToleranceOverrides {
  POINT_CONTAINMENT?: number;
  DUPLICATE_CURVE?: number;
  FUZZY_MATCH?: number;
  DEFAULT_MODEL?: number;
  ENDPOINT_CONNECTION?: number;
  CURVE_CONNECTOR?: number;
  SURFACE_COMPARISON?: number;
}

export interface ToleranceFieldConfig {
  value: number;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface ToleranceConfig {
  [key: string]: ToleranceFieldConfig;
}

// Tolerance field metadata (UI configuration only - values come from backend)
export const TOLERANCE_FIELD_METADATA: Record<string, Omit<ToleranceFieldConfig, 'value'>> = {
  POINT_CONTAINMENT: {
    label: "Point Containment",
    description: "Tolerance for point containment checks",
    unit: "mm",
    min: 0.1,
    max: 10.0,
    step: 0.1
  },
  DUPLICATE_CURVE: {
    label: "Duplicate Curve Detection",
    description: "Tolerance for detecting duplicate curves",
    unit: "mm",
    min: 0.1,
    max: 5.0,
    step: 0.1
  },
  FUZZY_MATCH: {
    label: "Fuzzy Layer Matching",
    description: "Threshold for fuzzy layer name matching",
    unit: "",
    min: 0.1,
    max: 1.0,
    step: 0.01
  },
  DEFAULT_MODEL: {
    label: "Default Model Tolerance",
    description: "Fallback model tolerance",
    unit: "mm",
    min: 0.001,
    max: 1.0,
    step: 0.001
  },
  ENDPOINT_CONNECTION: {
    label: "Endpoint Connection",
    description: "Tolerance for endpoint connections",
    unit: "mm",
    min: 10.0,
    max: 1000.0,
    step: 10.0
  },
  CURVE_CONNECTOR: {
    label: "Curve Connector",
    description: "Tolerance for curve connector operations",
    unit: "mm",
    min: 50.0,
    max: 2000.0,
    step: 25.0
  },
  SURFACE_COMPARISON: {
    label: "Surface Comparison",
    description: "Tolerance for surface area/bbox comparison",
    unit: "",
    min: 0.001,
    max: 0.1,
    step: 0.001
  }
};

export const buildToleranceConfig = (backendDefaults: Record<string, number>): ToleranceConfig => {
  const config: ToleranceConfig = {};
  
  Object.entries(backendDefaults).forEach(([key, value]) => {
    const metadata = TOLERANCE_FIELD_METADATA[key];
    if (metadata) {
      config[key] = {
        value,
        ...metadata
      };
    }
  });
  
  return config;
};