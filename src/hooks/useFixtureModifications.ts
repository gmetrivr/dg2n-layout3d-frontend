import { useState, useCallback } from 'react';
import { type LocationData, generateFixtureUID } from './useFixtureSelection';

// Legacy interfaces - keeping for backward compatibility but no longer actively used
// All modification data is now embedded directly in LocationData objects
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
  newBlockName?: string;
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
  // All modification tracking is now done via embedded flags in LocationData
  // No more separate Maps needed
  const [modifiedFloorPlates, setModifiedFloorPlates] = useState<Map<string, any>>(new Map());
  const [deletedFixtures, setDeletedFixtures] = useState<Set<string>>(new Set());
  const [deletedFixturePositions, setDeletedFixturePositions] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [fixturesToDelete, setFixturesToDelete] = useState<LocationData[]>([]);

  const handlePositionChange = useCallback((location: LocationData, newPosition: [number, number, number]) => {
    // This function is called only when transform ends (from Canvas3D)
    // Single state update to minimize re-renders and preserve transform controls
    const key = generateFixtureUID(location);
    
    // Batch all updates in a single state change to prevent multiple re-renders
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return {
          ...loc,
          posX: newPosition[0],
          posY: newPosition[1], 
          posZ: newPosition[2],
          wasMoved: true,
          // Preserve original position for reset functionality
          originalPosX: loc.originalPosX ?? loc.posX,
          originalPosY: loc.originalPosY ?? loc.posY,
          originalPosZ: loc.originalPosZ ?? loc.posZ,
        };
      }
      return loc;
    }));

    // Update selectedLocation without triggering re-selection that breaks transform controls
    setSelectedLocation(prev => {
      if (prev && generateFixtureUID(prev) === key) {
        return {
          ...prev,
          posX: newPosition[0],
          posY: newPosition[1],
          posZ: newPosition[2],
          wasMoved: true,
          originalPosX: prev.originalPosX ?? prev.posX,
          originalPosY: prev.originalPosY ?? prev.posY,
          originalPosZ: prev.originalPosZ ?? prev.posZ,
        };
      }
      return prev;
    });

    // Also update selectedLocations to keep the array in sync
    setSelectedLocations(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return {
          ...loc,
          posX: newPosition[0],
          posY: newPosition[1],
          posZ: newPosition[2],
          wasMoved: true,
          originalPosX: loc.originalPosX ?? loc.posX,
          originalPosY: loc.originalPosY ?? loc.posY,
          originalPosZ: loc.originalPosZ ?? loc.posZ,
        };
      }
      return loc;
    }));
  }, [setLocationData, setSelectedLocation, setSelectedLocations]);


  const handleRotateFixture = useCallback((degrees: number) => {
    if (!selectedLocation) return;
    
    const key = generateFixtureUID(selectedLocation);
    
    // Batch all updates in a single state change to prevent multiple re-renders
    setLocationData(prev => prev.map(loc => {
      const locKey = generateFixtureUID(loc);
      if (locKey === key) {
        // Calculate new rotation
        let newRotationZ = loc.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...loc,
          // Update current rotation
          rotationZ: newRotationZ,
          // Set rotation flag and preserve original rotation
          wasRotated: true,
          originalRotationX: loc.originalRotationX ?? loc.rotationX,
          originalRotationY: loc.originalRotationY ?? loc.rotationY,
          originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
        };
      }
      return loc;
    }));

    // Update selectedLocation without triggering re-selection that breaks transform controls
    setSelectedLocation(prev => {
      if (prev && generateFixtureUID(prev) === key) {
        let newRotationZ = prev.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...prev,
          rotationZ: newRotationZ,
          wasRotated: true,
          originalRotationX: prev.originalRotationX ?? prev.rotationX,
          originalRotationY: prev.originalRotationY ?? prev.rotationY,
          originalRotationZ: prev.originalRotationZ ?? prev.rotationZ,
        };
      }
      return prev;
    });
  }, [selectedLocation, setLocationData, setSelectedLocation]);

  const handleMultiRotateFixture = useCallback((degrees: number) => {
    // Update LocationData for all selected fixtures
    setLocationData(prev => prev.map(loc => {
      const isSelected = selectedLocations.some(selectedLoc => 
        generateFixtureUID(selectedLoc) === generateFixtureUID(loc)
      );
      
      if (isSelected) {
        // Calculate new rotation
        let newRotationZ = loc.rotationZ + degrees;
        newRotationZ = ((newRotationZ % 360) + 360) % 360;
        
        return {
          ...loc,
          // Update current rotation
          rotationZ: newRotationZ,
          // Set rotation flag and preserve original rotation
          wasRotated: true,
          originalRotationX: loc.originalRotationX ?? loc.rotationX,
          originalRotationY: loc.originalRotationY ?? loc.rotationY,
          originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
        };
      }
      return loc;
    }));

    // Update selectedLocations
    setSelectedLocations(prev => prev.map(loc => {
      let newRotationZ = loc.rotationZ + degrees;
      newRotationZ = ((newRotationZ % 360) + 360) % 360;
      
      return {
        ...loc,
        rotationZ: newRotationZ,
        wasRotated: true,
        originalRotationX: loc.originalRotationX ?? loc.rotationX,
        originalRotationY: loc.originalRotationY ?? loc.rotationY,
        originalRotationZ: loc.originalRotationZ ?? loc.rotationZ,
      };
    }));
  }, [selectedLocations]);

  const handleResetPosition = useCallback((location: LocationData) => {
    // Reset fixture to original values using embedded data
    const resetLocation: LocationData = {
      ...location,
      // Reset position
      posX: location.originalPosX ?? location.posX,
      posY: location.originalPosY ?? location.posY, 
      posZ: location.originalPosZ ?? location.posZ,
      // Reset rotation
      rotationX: location.originalRotationX ?? location.rotationX,
      rotationY: location.originalRotationY ?? location.rotationY,
      rotationZ: location.originalRotationZ ?? location.rotationZ,
      // Reset other properties
      blockName: location.originalBlockName ?? location.blockName,
      brand: location.originalBrand ?? location.brand,
      count: location.originalCount ?? location.count,
      hierarchy: location.originalHierarchy ?? location.hierarchy,
      // Clear modification flags
      wasMoved: false,
      wasRotated: false,
      wasTypeChanged: false,
      wasBrandChanged: false,
      wasCountChanged: false,
      wasHierarchyChanged: false,
    };
    
    // Update location data
    setLocationData(prev => prev.map(loc => 
      generateFixtureUID(loc) === generateFixtureUID(location) ? resetLocation : loc
    ));
    
    setSelectedLocation(null);
    setTimeout(() => setSelectedLocation(resetLocation), 10);
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
      // Update selected locations
      setSelectedLocations(prev => prev.map(loc => ({ 
        ...loc, 
        brand: newBrand,
        wasBrandChanged: true,
        originalBrand: loc.originalBrand ?? loc.brand
      })));
      
      // Update location data
      setLocationData(prev => prev.map(loc => {
        const isSelected = selectedLocations.some(selectedLoc => 
          generateFixtureUID(selectedLoc) === generateFixtureUID(loc)
        );
        if (isSelected) {
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: true,
            originalBrand: loc.originalBrand ?? loc.brand
          };
        }
        return loc;
      }));
    } else if (selectedLocation) {
      const key = generateFixtureUID(selectedLocation);
      
      setSelectedLocation(prev => prev ? { 
        ...prev, 
        brand: newBrand,
        wasBrandChanged: true,
        originalBrand: prev.originalBrand ?? prev.brand
      } : null);
      
      // Update location data
      setLocationData(prev => prev.map(loc => {
        if (generateFixtureUID(loc) === key) {
          return {
            ...loc,
            brand: newBrand,
            wasBrandChanged: true,
            originalBrand: loc.originalBrand ?? loc.brand
          };
        }
        return loc;
      }));
    }
  }, [selectedLocation, selectedLocations, setSelectedLocation, setSelectedLocations, setLocationData]);

  const handleFixtureCountChange = useCallback((location: LocationData, newCount: number) => {
    const key = generateFixtureUID(location);
    
    setSelectedLocation(prev => prev ? { 
      ...prev, 
      count: newCount,
      wasCountChanged: true,
      originalCount: prev.originalCount ?? prev.count
    } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return { 
          ...loc, 
          count: newCount,
          wasCountChanged: true,
          originalCount: loc.originalCount ?? loc.count
        };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureCountChangeMulti = useCallback((locations: LocationData[], newCount: number) => {
    setSelectedLocations(prev => prev.map(loc => ({ 
      ...loc, 
      count: newCount,
      wasCountChanged: true,
      originalCount: loc.originalCount ?? loc.count
    })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = generateFixtureUID(loc);
      const isModified = locations.some(selectedLoc => {
        const selectedKey = generateFixtureUID(selectedLoc);
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { 
          ...loc, 
          count: newCount,
          wasCountChanged: true,
          originalCount: loc.originalCount ?? loc.count
        };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleFixtureHierarchyChange = useCallback((location: LocationData, newHierarchy: number) => {
    const key = generateFixtureUID(location);
    
    setSelectedLocation(prev => prev ? { 
      ...prev, 
      hierarchy: newHierarchy,
      wasHierarchyChanged: true,
      originalHierarchy: prev.originalHierarchy ?? prev.hierarchy
    } : null);
    
    setLocationData(prev => prev.map(loc => {
      if (generateFixtureUID(loc) === key) {
        return { 
          ...loc, 
          hierarchy: newHierarchy,
          wasHierarchyChanged: true,
          originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
        };
      }
      return loc;
    }));
  }, [setSelectedLocation, setLocationData]);

  const handleFixtureHierarchyChangeMulti = useCallback((locations: LocationData[], newHierarchy: number) => {
    setSelectedLocations(prev => prev.map(loc => ({ 
      ...loc, 
      hierarchy: newHierarchy,
      wasHierarchyChanged: true,
      originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
    })));
    
    setLocationData(prev => prev.map(loc => {
      const locationKey = generateFixtureUID(loc);
      const isModified = locations.some(selectedLoc => {
        const selectedKey = generateFixtureUID(selectedLoc);
        return selectedKey === locationKey;
      });
      
      if (isModified) {
        return { 
          ...loc, 
          hierarchy: newHierarchy,
          wasHierarchyChanged: true,
          originalHierarchy: loc.originalHierarchy ?? loc.hierarchy
        };
      }
      return loc;
    }));
  }, [setSelectedLocations, setLocationData]);

  const handleDuplicateFixture = useCallback((location: LocationData) => {
    // Calculate new hierarchy as max+1 for the current floor
    setLocationData(prev => {
      const currentFloorFixtures = prev.filter(loc =>
        loc.floorIndex === location.floorIndex && !loc.forDelete
      );
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;
      const newHierarchy = maxHierarchy + 1;

      // Create duplicate with current position/properties (all modifications are embedded in location object)
      const duplicatedFixture: LocationData = {
        ...location,
        // Use current position (current position includes any moves)
        posX: location.posX,  // Duplicate in place
        posY: location.posY,
        posZ: location.posZ,
        // Set new hierarchy
        hierarchy: newHierarchy,
        // Keep current blockName, rotation, brand, count (includes all modifications)
        // Reset modification flags since this is a "new" fixture
        wasMoved: false, // Will be set to true if the duplicate is moved later
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,
        wasDuplicated: true, // Mark as duplicate
        // Preserve original values for reset functionality
        originalPosX: location.posX, // Original position of the source fixture (not the duplicate's position)
        originalPosY: location.posY,
        originalPosZ: location.posZ,
        originalRotationX: location.rotationX,
        originalRotationY: location.rotationY,
        originalRotationZ: location.rotationZ,
        originalBlockName: location.blockName,
        originalBrand: location.brand,
        originalCount: location.count,
        originalHierarchy: newHierarchy,
        originalGlbUrl: location.glbUrl,
        // Generate new unique timestamps to ensure unique UID even at same position
        _updateTimestamp: Date.now() + Math.random() * 1000,
        _ingestionTimestamp: Date.now() + Math.random() * 1000 // New unique timestamp for the duplicate
      };

      setSelectedLocation(duplicatedFixture);
      setSelectedLocations([duplicatedFixture]);

      // Add the duplicated fixture to the location data
      return [...prev, duplicatedFixture];
    });
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
      const key = generateFixtureUID(location);
      keysToDelete.add(key);
    });
    
    setDeletedFixtures(prev => new Set([...prev, ...keysToDelete]));
    
    setSelectedLocation(null);
    setSelectedLocations([]);
    
    setDeleteConfirmationOpen(false);
    setFixturesToDelete([]);
  }, [fixturesToDelete, setSelectedLocation, setSelectedLocations]);

  const handleSplitFixture = useCallback((location: LocationData, leftCount: number, rightCount: number) => {
    // Calculate positioning for the split fixtures
    // Take the center point and create a line with total length = count * 0.6 units
    // Split this line into two segments based on the split counts

    const fixtureLength = 0.6; // Length of one fixture in units
    const originalTotalLength = location.count * fixtureLength;
    const leftSegmentLength = leftCount * fixtureLength;
    const rightSegmentLength = rightCount * fixtureLength;

    // Calculate the midpoints of each segment
    // Left segment: starts at -originalTotalLength/2, midpoint at start + leftSegmentLength/2
    const leftMidpointOffset = (-originalTotalLength / 2) + (leftSegmentLength / 2);
    // Right segment: starts at -originalTotalLength/2 + leftSegmentLength, midpoint at start + rightSegmentLength/2
    const rightMidpointOffset = (-originalTotalLength / 2) + leftSegmentLength + (rightSegmentLength / 2);

    // Apply rotation to the offsets (if fixture is rotated)
    const rotationZ = (location.rotationZ * Math.PI) / 180; // Convert to radians

    // Calculate final positions considering rotation
    const leftGroupX = location.posX + (leftMidpointOffset * Math.cos(rotationZ));
    const leftGroupY = location.posY + (leftMidpointOffset * Math.sin(rotationZ));

    const rightGroupX = location.posX + (rightMidpointOffset * Math.cos(rotationZ));
    const rightGroupY = location.posY + (rightMidpointOffset * Math.sin(rotationZ));

    // Mark the original fixture for deletion by capturing its UID before state update
    const originalKey = generateFixtureUID(location);

    // Single atomic update: mark original for deletion and add split fixtures
    setLocationData(prev => {
      // Calculate new hierarchies as max+1 and max+2 for the current floor
      const currentFloorFixtures = prev.filter(loc =>
        loc.floorIndex === location.floorIndex && !loc.forDelete
      );
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;
      const leftHierarchy = maxHierarchy + 1;
      const rightHierarchy = maxHierarchy + 2;

      // Create left split fixture
      const leftSplitFixture: LocationData = {
        ...location,
        posX: leftGroupX,
        posY: leftGroupY,
        posZ: location.posZ, // Keep same Z position
        count: leftCount,
        hierarchy: leftHierarchy,
        wasSplit: true,
        originalCount: leftCount, // New fixture's original count is the split value
        originalHierarchy: leftHierarchy,
        // Generate new unique identifiers with sufficient separation
        _updateTimestamp: Date.now() + Math.floor(Math.random() * 10000),
        _ingestionTimestamp: Date.now() + Math.floor(Math.random() * 10000),
        // Clear other modification flags since this is a new fixture
        wasMoved: false,
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,
        wasDuplicated: false
      };

      // Create right split fixture
      const rightSplitFixture: LocationData = {
        ...location,
        posX: rightGroupX,
        posY: rightGroupY,
        posZ: location.posZ, // Keep same Z position
        count: rightCount,
        hierarchy: rightHierarchy,
        wasSplit: true,
        originalCount: rightCount, // New fixture's original count is the split value
        originalHierarchy: rightHierarchy,
        // Generate new unique identifiers with sufficient separation
        _updateTimestamp: Date.now() + 50000 + Math.floor(Math.random() * 10000),
        _ingestionTimestamp: Date.now() + 50000 + Math.floor(Math.random() * 10000),
        // Clear other modification flags since this is a new fixture
        wasMoved: false,
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,
        wasDuplicated: false
      };

      // Mark the original fixture as forDelete (preserve all properties for UID stability)
      const withMarkedOriginal = prev.map(loc =>
        generateFixtureUID(loc) === originalKey
          ? { ...loc, forDelete: true }  // Only add forDelete flag, don't change any other properties
          : loc
      );

      // Add the new split fixtures
      const newData = [...withMarkedOriginal, leftSplitFixture, rightSplitFixture];

      return newData;
    });

    // Clear selection
    setSelectedLocation(null);
    setSelectedLocations([]);
  }, [setLocationData, setSelectedLocation, setSelectedLocations]);

  const canMergeFixtures = useCallback((fixtures: LocationData[], fixtureTypeMap: Map<string, string>): boolean => {
    // Fast early exits for performance
    if (fixtures.length !== 2) return false;
    
    const [fixtureA, fixtureB] = fixtures;
    
    // Check types first (cheapest check)
    const typeA = fixtureTypeMap.get(fixtureA.blockName);
    const typeB = fixtureTypeMap.get(fixtureB.blockName);
    if (typeA !== "WALL-BAY" || typeB !== "WALL-BAY") return false;
    
    // Check rotation alignment (also cheap)
    const rotationDiff = Math.abs(fixtureA.rotationZ - fixtureB.rotationZ);
    if (rotationDiff > 1 && rotationDiff < 359) return false;
    
    // Only do expensive position calculations if basic checks pass
    const fixtureLength = 0.6;
    const rotationZ = (fixtureA.rotationZ * Math.PI) / 180;
    
    const cosRot = Math.cos(rotationZ);
    const sinRot = Math.sin(rotationZ);
    
    const tolerance = 0.2;
    
    // New approach: Check if the fixtures are actually touching edge-to-edge
    // Calculate the edges of each fixture along the orientation axis
    const projA = fixtureA.posX * cosRot + fixtureA.posY * sinRot;
    const projB = fixtureB.posX * cosRot + fixtureB.posY * sinRot;
    
    // Calculate the edges of each fixture
    const aLeftEdge = projA - (fixtureA.count * fixtureLength * 0.5);
    const aRightEdge = projA + (fixtureA.count * fixtureLength * 0.5);
    const bLeftEdge = projB - (fixtureB.count * fixtureLength * 0.5);
    const bRightEdge = projB + (fixtureB.count * fixtureLength * 0.5);
    
    // Check if they're touching: A's right edge touches B's left edge OR B's right edge touches A's left edge
    const gapAB = Math.abs(aRightEdge - bLeftEdge);
    const gapBA = Math.abs(bRightEdge - aLeftEdge);
    
    // Also check if they're on the same perpendicular line (same position perpendicular to orientation)
    const perpA = -fixtureA.posX * sinRot + fixtureA.posY * cosRot;
    const perpB = -fixtureB.posX * sinRot + fixtureB.posY * cosRot;
    const perpGap = Math.abs(perpA - perpB);
    
    // They're adjacent if: 
    // 1. One of the edge gaps is very small (touching)
    // 2. They're aligned perpendicular to the orientation
    return (gapAB < tolerance || gapBA < tolerance) && perpGap < tolerance;
  }, []);

  const handleMergeFixtures = useCallback((fixtures: LocationData[]) => {
    if (fixtures.length !== 2) return;

    const [fixtureA, fixtureB] = fixtures;

    // Generate keys IMMEDIATELY to avoid any reference issues
    const keyA = generateFixtureUID(fixtureA);
    const keyB = generateFixtureUID(fixtureB);

    const totalCount = fixtureA.count + fixtureB.count;

    // Calculate the actual center of the combined stack
    // The GLB positions should remain unchanged, so we need to find where
    // the center of the totalCount stack would be to keep all GLBs in place
    const fixtureLength = 0.6;
    const rotationZ = (fixtureA.rotationZ * Math.PI) / 180;
    const cosRot = Math.cos(rotationZ);
    const sinRot = Math.sin(rotationZ);

    // Determine which fixture is leftmost along the orientation axis
    const projectionA = fixtureA.posX * cosRot + fixtureA.posY * sinRot;
    const projectionB = fixtureB.posX * cosRot + fixtureB.posY * sinRot;

    const leftFixture = projectionA < projectionB ? fixtureA : fixtureB;

    // Calculate where the center of the merged stack should be
    // Find the leftmost edge of the leftmost fixture's stack
    const totalSpan = totalCount * fixtureLength;
    const leftEdgeX = leftFixture.posX - (leftFixture.count * fixtureLength * 0.5 * cosRot);
    const leftEdgeY = leftFixture.posY - (leftFixture.count * fixtureLength * 0.5 * sinRot);

    // The center of the merged stack is at the leftmost edge + half the total span
    const centerX = leftEdgeX + (totalSpan * 0.5 * cosRot);
    const centerY = leftEdgeY + (totalSpan * 0.5 * sinRot);

    // Mark both original fixtures as deleted for export purposes FIRST
    // This ensures the viewer filter catches them immediately
    setDeletedFixtures(prev => new Set([...prev, keyA, keyB]));

    setLocationData(prev => {
      // Calculate new hierarchy as max+1 for the current floor
      const currentFloorFixtures = prev.filter(loc =>
        loc.floorIndex === fixtureA.floorIndex && !loc.forDelete
      );
      const maxHierarchy = currentFloorFixtures.length > 0
        ? Math.max(...currentFloorFixtures.map(loc => loc.hierarchy))
        : 0;
      const newHierarchy = maxHierarchy + 1;

      // Create merged fixture at the center point
      const mergedFixture: LocationData = {
        ...fixtureA, // Use first fixture as base
        posX: centerX,
        posY: centerY,
        count: totalCount,
        hierarchy: newHierarchy,
        wasMerged: true, // New flag to track merged fixtures
        originalCount: totalCount, // Set original count to the merged value
        originalHierarchy: newHierarchy,
        // Generate new unique identifier
        _updateTimestamp: Date.now() + Math.floor(Math.random() * 10000),
        _ingestionTimestamp: Date.now() + Math.floor(Math.random() * 10000),
        // Clear other modification flags since this is a new fixture
        wasMoved: false,
        wasRotated: false,
        wasTypeChanged: false,
        wasBrandChanged: false,
        wasCountChanged: false,
        wasHierarchyChanged: false,
        wasDuplicated: false,
        wasSplit: false
      };

      // Remove both original fixtures and add merged fixture
      const withoutOriginals = prev.filter(loc => {
        const key = generateFixtureUID(loc);
        return key !== keyA && key !== keyB;
      });

      return [...withoutOriginals, mergedFixture];
    });

    // Store original positions of deleted fixtures for export matching
    const positionKeyA = `${fixtureA.originalBlockName || fixtureA.blockName}-${(fixtureA.originalPosX || fixtureA.posX).toFixed(3)}-${(fixtureA.originalPosY || fixtureA.posY).toFixed(3)}-${(fixtureA.originalPosZ || fixtureA.posZ).toFixed(3)}`;
    const positionKeyB = `${fixtureB.originalBlockName || fixtureB.blockName}-${(fixtureB.originalPosX || fixtureB.posX).toFixed(3)}-${(fixtureB.originalPosY || fixtureB.posY).toFixed(3)}-${(fixtureB.originalPosZ || fixtureB.posZ).toFixed(3)}`;
    setDeletedFixturePositions(prev => new Set([...prev, positionKeyA, positionKeyB]));

    // Clear selection
    setSelectedLocation(null);
    setSelectedLocations([]);
  }, [setLocationData, setSelectedLocation, setSelectedLocations]);

  return {
    // State  
    modifiedFloorPlates,
    deletedFixtures,
    deletedFixturePositions,
    deleteConfirmationOpen,
    fixturesToDelete,
    
    // Setters (for external use)
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
    handleSplitFixture,
    canMergeFixtures,
    handleMergeFixtures,
  };
}