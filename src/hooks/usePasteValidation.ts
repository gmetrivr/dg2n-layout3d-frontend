import { useCallback } from 'react';
import type { ClipboardData } from './useClipboard';
import type { BrandCategoriesResponse } from '../services/api';

export interface ValidationResult {
  isValid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
  suggestions: string[];
}

export interface ValidationWarning {
  type: 'floor_mismatch' | 'brand_missing' | 'fixture_type_missing' | 'variant_missing';
  message: string;
  affectedItems: number;
  suggestion?: string;
}

export interface ValidationError {
  type: 'no_target_floor' | 'invalid_data';
  message: string;
}

export function usePasteValidation(
  availableFloors: number[],
  brandCategories: BrandCategoriesResponse | null,
  fixtureTypeMap: Map<string, string>
) {
  const validatePaste = useCallback((
    clipboardData: ClipboardData,
    targetFloorIndex: number
  ): ValidationResult => {
    const warnings: ValidationWarning[] = [];
    const errors: ValidationError[] = [];
    const suggestions: string[] = [];

    // 1. Check target floor exists
    if (!availableFloors.includes(targetFloorIndex)) {
      errors.push({
        type: 'no_target_floor',
        message: `Target floor ${targetFloorIndex} does not exist in this store`,
      });
      return { isValid: false, warnings, errors, suggestions };
    }

    // 2. Check source floors
    const missingFloors = clipboardData.metadata.sourceFloors.filter(
      f => !availableFloors.includes(f)
    );
    if (missingFloors.length > 0) {
      const affectedCount = clipboardData.fixtures.filter(
        f => missingFloors.includes(f.floorIndex)
      ).length + clipboardData.architecturalObjects.filter(
        o => missingFloors.includes(o.floorIndex)
      ).length;

      if (affectedCount > 0) {
        warnings.push({
          type: 'floor_mismatch',
          message: `${affectedCount} item(s) from floor(s) ${missingFloors.join(', ')} will be pasted to floor ${targetFloorIndex}`,
          affectedItems: affectedCount,
          suggestion: 'Items will be pasted to the current floor',
        });
      }
    }

    // 3. Check brands
    if (brandCategories) {
      const allBrands = [
        ...brandCategories.categories.brands.private_label.items,
        ...brandCategories.categories.brands.external.items,
      ];
      const missingBrands = clipboardData.metadata.brands.filter(
        b => !allBrands.includes(b)
      );

      if (missingBrands.length > 0) {
        const affectedCount = clipboardData.fixtures.filter(
          f => missingBrands.includes(f.brand)
        ).length;

        if (affectedCount > 0) {
          warnings.push({
            type: 'brand_missing',
            message: `${affectedCount} fixture(s) use brand(s) not available in this store: ${missingBrands.join(', ')}`,
            affectedItems: affectedCount,
            suggestion: 'You may need to change brands after pasting',
          });
        }
      }
    }

    // 4. Check fixture types
    const missingTypes = clipboardData.metadata.fixtureTypes.filter(
      type => !fixtureTypeMap.has(type)
    );
    if (missingTypes.length > 0) {
      const affectedCount = clipboardData.fixtures.filter(
        f => missingTypes.includes(f.blockName)
      ).length;

      if (affectedCount > 0) {
        warnings.push({
          type: 'fixture_type_missing',
          message: `${affectedCount} fixture(s) use types not available: ${missingTypes.join(', ')}`,
          affectedItems: affectedCount,
          suggestion: 'Fixtures may not render correctly',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
      suggestions,
    };
  }, [availableFloors, brandCategories, fixtureTypeMap]);

  const getFloorMapping = useCallback((
    sourceFloors: number[],
    targetFloor: number
  ): Map<number, number> => {
    const mapping = new Map<number, number>();

    // For now, map all source floors to target floor
    // In future, could be more sophisticated
    sourceFloors.forEach(floor => {
      if (availableFloors.includes(floor)) {
        mapping.set(floor, floor); // Keep same floor if it exists
      } else {
        mapping.set(floor, targetFloor); // Map to target floor if source doesn't exist
      }
    });

    return mapping;
  }, [availableFloors]);

  return {
    validatePaste,
    getFloorMapping,
  };
}
