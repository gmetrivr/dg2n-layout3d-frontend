import { useState, useCallback } from 'react';
import { type LocationData } from './useFixtureSelection';

export interface MovedFixture {
  originalPosition: [number, number, number];
  newPosition: [number, number, number];
}

export interface RotatedFixture {
  originalRotation: [number, number, number];
  rotationOffset: number;
}

export interface ModifiedFixtureBrand {
  originalBrand: string;
  newBrand: string;
}

export interface ModifiedFixture {
  originalType: string;
  newType: string;
  newGlbUrl: string;
}

export interface ModifiedFixtureCount {
  originalCount: number;
  newCount: number;
}

export interface ModifiedFixtureHierarchy {
  originalHierarchy: number;
  newHierarchy: number;
}

export function useFixtureModifications(
  selectedLocation: LocationData | null,
  selectedLocations: LocationData[],
  selectedFloorPlate: any,
  setSelectedLocation: React.Dispatch<React.SetStateAction<LocationData | null>>,
  setSelectedLocations: React.Dispatch<React.SetStateAction<LocationData[]>>,
  setLocationData: React.Dispatch<React.SetStateAction<LocationData[]>>,
  setSelectedFloorPlate: React.Dispatch<React.SetStateAction<any>>
) {
  const [movedFixtures, setMovedFixtures] = useState<Map<string, MovedFixture>>(new Map());
  const [rotatedFixtures, setRotatedFixtures] = useState<Map<string, RotatedFixture>>(new Map());
  const [modifiedFixtures, setModifiedFixtures] = useState<Map<string, ModifiedFixture>>(new Map());
  const [modifiedFixtureBrands, setModifiedFixtureBrands] = useState<Map<string, ModifiedFixtureBrand>>(new Map());
  const [modifiedFixtureCounts, setModifiedFixtureCounts] = useState<Map<string, ModifiedFixtureCount>>(new Map());
  const [modifiedFixtureHierarchies, setModifiedFixtureHierarchies] = useState<Map<string, ModifiedFixtureHierarchy>>(new Map());
  const [modifiedFloorPlates, setModifiedFloorPlates] = useState<Map<string, any>>(new Map());
  const [deletedFixtures, setDeletedFixtures] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [fixturesToDelete, setFixturesToDelete] = useState<LocationData[]>([]);

  const handlePositionChange = useCallback((location: LocationData, newPosition: [number, number, number]) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    setMovedFixtures(prev => {
      const existing = prev.get(key);
      const newValue = {
        originalPosition: [location.posX, location.posY, location.posZ] as [number, number, number],
        newPosition: newPosition
      };
      
      if (existing && 
          existing.newPosition[0] === newPosition[0] &&
          existing.newPosition[1] === newPosition[1] &&
          existing.newPosition[2] === newPosition[2]) {
        return prev;
      }
      
      const newMap = new Map(prev);
      newMap.set(key, newValue);
      return newMap;
    });
  }, []);

  const handleRotateFixture = useCallback((degrees: number) => {
    if (!selectedLocation) return;
    
    const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
    setRotatedFixtures(prev => {
      const existing = prev.get(key);
      const currentOffset = existing?.rotationOffset || 0;
      let newOffset = currentOffset + degrees;
      
      newOffset = ((newOffset % 360) + 360) % 360;
      
      if (newOffset === 0 || Math.abs(newOffset - 360) < 0.001) {
        if (!prev.has(key)) return prev;
        const newMap = new Map(prev);
        newMap.delete(key);
        return newMap;
      }
      
      if (existing && existing.rotationOffset === newOffset) {
        return prev;
      }
      
      const newMap = new Map(prev);
      newMap.set(key, {
        originalRotation: [selectedLocation.rotationX, selectedLocation.rotationY, selectedLocation.rotationZ],
        rotationOffset: newOffset
      });
      return newMap;
    });
  }, [selectedLocation]);

  const handleMultiRotateFixture = useCallback((degrees: number) => {
    selectedLocations.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      setRotatedFixtures(prev => {
        const existing = prev.get(key);
        const currentOffset = existing?.rotationOffset || 0;
        let newOffset = currentOffset + degrees;
        
        newOffset = ((newOffset % 360) + 360) % 360;
        
        if (newOffset === 0 || Math.abs(newOffset - 360) < 0.001) {
          if (!prev.has(key)) return prev;
          const newMap = new Map(prev);
          newMap.delete(key);
          return newMap;
        }
        
        const newMap = new Map(prev);
        newMap.set(key, {
          originalRotation: [location.rotationX, location.rotationY, location.rotationZ],
          rotationOffset: newOffset
        });
        return newMap;
      });
    });
  }, [selectedLocations]);

  const handleResetPosition = useCallback((location: LocationData) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    
    setMovedFixtures(prev => {
      if (!prev.has(key)) return prev;
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    
    setRotatedFixtures(prev => {
      if (!prev.has(key)) return prev;
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
    
    setModifiedFixtureBrands(prev => {
      if (!prev.has(key)) return prev;
      const newMap = new Map(prev);
      const originalBrand = newMap.get(key)?.originalBrand;
      newMap.delete(key);
      if (originalBrand) {
        setSelectedLocation(prev => prev ? { ...prev, brand: originalBrand } : null);
      }
      return newMap;
    });
    
    setModifiedFixtureCounts(prev => {
      if (!prev.has(key)) return prev;
      const newMap = new Map(prev);
      const originalCount = newMap.get(key)?.originalCount;
      newMap.delete(key);
      if (originalCount !== undefined) {
        setSelectedLocation(prev => prev ? { ...prev, count: originalCount } : null);
        setLocationData(prevData => prevData.map(loc => {
          if (loc.blockName === location.blockName &&
              Math.abs(loc.posX - location.posX) < 0.001 &&
              Math.abs(loc.posY - location.posY) < 0.001 &&
              Math.abs(loc.posZ - location.posZ) < 0.001) {
            return { ...loc, count: originalCount };
          }
          return loc;
        }));
      }
      return newMap;
    });
    
    setModifiedFixtureHierarchies(prev => {
      if (!prev.has(key)) return prev;
      const newMap = new Map(prev);
      const originalHierarchy = newMap.get(key)?.originalHierarchy;
      newMap.delete(key);
      if (originalHierarchy !== undefined) {
        setSelectedLocation(prev => prev ? { ...prev, hierarchy: originalHierarchy } : null);
        setLocationData(prevData => prevData.map(loc => {
          if (loc.blockName === location.blockName &&
              Math.abs(loc.posX - location.posX) < 0.001 &&
              Math.abs(loc.posY - location.posY) < 0.001 &&
              Math.abs(loc.posZ - location.posZ) < 0.001) {
            return { ...loc, hierarchy: originalHierarchy };
          }
          return loc;
        }));
      }
      return newMap;
    });
    
    setSelectedLocation(null);
    setTimeout(() => setSelectedLocation(location), 10);
  }, [setSelectedLocation, setLocationData]);

  const handleBrandChange = useCallback((newBrand: string) => {
    if (!selectedFloorPlate) return;
    
    const key = selectedFloorPlate.meshName || `${selectedFloorPlate.surfaceId}-${selectedFloorPlate.brand}`;
    setModifiedFloorPlates(prev => {
      const newMap = new Map(prev);
      newMap.set(key, {
        ...selectedFloorPlate,
        brand: newBrand,
        originalBrand: selectedFloorPlate.originalBrand || selectedFloorPlate.brand
      });
      return newMap;
    });
    
    setSelectedFloorPlate((prev: any) => prev ? { ...prev, brand: newBrand } : null);
  }, [selectedFloorPlate, setSelectedFloorPlate]);

  const handleFixtureBrandChange = useCallback((newBrand: string) => {
    if (selectedLocations.length > 1) {
      selectedLocations.forEach(location => {
        const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
        setModifiedFixtureBrands(prev => {
          const newMap = new Map(prev);
          newMap.set(key, {
            originalBrand: location.brand,
            newBrand: newBrand
          });
          return newMap;
        });
      });
      
      setSelectedLocations(prev => prev.map(loc => ({ ...loc, brand: newBrand })));
    } else if (selectedLocation) {
      const key = `${selectedLocation.blockName}-${selectedLocation.posX}-${selectedLocation.posY}-${selectedLocation.posZ}`;
      setModifiedFixtureBrands(prev => {
        const newMap = new Map(prev);
        newMap.set(key, {
          originalBrand: selectedLocation.brand,
          newBrand: newBrand
        });
        return newMap;
      });
      
      setSelectedLocation(prev => prev ? { ...prev, brand: newBrand } : null);
    }
  }, [selectedLocation, selectedLocations, setSelectedLocation, setSelectedLocations]);

  const handleFixtureCountChange = useCallback((location: LocationData, newCount: number) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    setModifiedFixtureCounts(prev => {
      const newMap = new Map(prev);
      newMap.set(key, {
        originalCount: location.count,
        newCount: newCount
      });
      return newMap;
    });
    
    setSelectedLocation(prev => prev ? { ...prev, count: newCount } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (loc.blockName === location.blockName &&
          Math.abs(loc.posX - location.posX) < 0.001 &&
          Math.abs(loc.posY - location.posY) < 0.001 &&
          Math.abs(loc.posZ - location.posZ) < 0.001) {
        return { ...loc, count: newCount };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureCountChangeMulti = useCallback((locations: LocationData[], newCount: number) => {
    locations.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      setModifiedFixtureCounts(prev => {
        const newMap = new Map(prev);
        newMap.set(key, {
          originalCount: location.count,
          newCount: newCount
        });
        return newMap;
      });
    });
    
    setSelectedLocations(prev => prev.map(loc => ({ ...loc, count: newCount })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = `${loc.blockName}-${loc.posX}-${loc.posY}-${loc.posZ}`;
      const isModified = locations.some(selectedLoc => {
        const selectedKey = `${selectedLoc.blockName}-${selectedLoc.posX}-${selectedLoc.posY}-${selectedLoc.posZ}`;
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { ...loc, count: newCount };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleFixtureHierarchyChange = useCallback((location: LocationData, newHierarchy: number) => {
    const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
    setModifiedFixtureHierarchies(prev => {
      const newMap = new Map(prev);
      newMap.set(key, {
        originalHierarchy: location.hierarchy,
        newHierarchy: newHierarchy
      });
      return newMap;
    });
    
    setSelectedLocation(prev => prev ? { ...prev, hierarchy: newHierarchy } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (loc.blockName === location.blockName &&
          Math.abs(loc.posX - location.posX) < 0.001 &&
          Math.abs(loc.posY - location.posY) < 0.001 &&
          Math.abs(loc.posZ - location.posZ) < 0.001) {
        return { ...loc, hierarchy: newHierarchy };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureHierarchyChangeMulti = useCallback((locations: LocationData[], newHierarchy: number) => {
    locations.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      setModifiedFixtureHierarchies(prev => {
        const newMap = new Map(prev);
        newMap.set(key, {
          originalHierarchy: location.hierarchy,
          newHierarchy: newHierarchy
        });
        return newMap;
      });
    });
    
    setSelectedLocations(prev => prev.map(loc => ({ ...loc, hierarchy: newHierarchy })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = `${loc.blockName}-${loc.posX}-${loc.posY}-${loc.posZ}`;
      const isModified = locations.some(selectedLoc => {
        const selectedKey = `${selectedLoc.blockName}-${selectedLoc.posX}-${selectedLoc.posY}-${selectedLoc.posZ}`;
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { ...loc, hierarchy: newHierarchy };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleDuplicateFixture = useCallback((location: LocationData) => {
    const duplicatedFixture: LocationData = {
      ...location,
      posX: location.posX + 1.0,
      blockName: location.blockName,
      _updateTimestamp: Date.now()
    };
    
    setLocationData(prev => [...prev, duplicatedFixture]);
    setSelectedLocation(duplicatedFixture);
    setSelectedLocations([duplicatedFixture]);
  }, [setLocationData, setSelectedLocation, setSelectedLocations]);

  const handleDeleteFixture = useCallback((location: LocationData) => {
    setFixturesToDelete([location]);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleDeleteFixtures = useCallback((locations: LocationData[]) => {
    setFixturesToDelete(locations);
    setDeleteConfirmationOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const keysToDelete = new Set<string>();
    
    fixturesToDelete.forEach(location => {
      const key = `${location.blockName}-${location.posX}-${location.posY}-${location.posZ}`;
      keysToDelete.add(key);
    });
    
    setDeletedFixtures(prev => new Set([...prev, ...keysToDelete]));
    
    setSelectedLocation(null);
    setSelectedLocations([]);
    
    setMovedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setRotatedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtureBrands(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtures(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtureCounts(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setModifiedFixtureHierarchies(prev => {
      const newMap = new Map(prev);
      keysToDelete.forEach(key => newMap.delete(key));
      return newMap;
    });
    
    setDeleteConfirmationOpen(false);
    setFixturesToDelete([]);
  }, [fixturesToDelete, setSelectedLocation, setSelectedLocations]);

  return {
    // State
    movedFixtures,
    rotatedFixtures,
    modifiedFixtures,
    modifiedFixtureBrands,
    modifiedFixtureCounts,
    modifiedFixtureHierarchies,
    modifiedFloorPlates,
    deletedFixtures,
    deleteConfirmationOpen,
    fixturesToDelete,
    
    // Setters (for external use)
    setModifiedFixtures,
    setModifiedFloorPlates,
    setDeleteConfirmationOpen,
    
    // Handlers
    handlePositionChange,
    handleRotateFixture,
    handleMultiRotateFixture,
    handleResetPosition,
    handleBrandChange,
    handleFixtureBrandChange,
    handleFixtureCountChange,
    handleFixtureCountChangeMulti,
    handleFixtureHierarchyChange,
    handleFixtureHierarchyChangeMulti,
    handleDuplicateFixture,
    handleDeleteFixture,
    handleDeleteFixtures,
    handleConfirmDelete,
  };
}