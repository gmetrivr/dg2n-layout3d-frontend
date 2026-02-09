import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shadcn/components/ui/dialog';

export interface MakeLiveStats {
  totalFloors: number;
  totalFixtures: number;
  totalBrands: number;
  fixturesPerFloor: Record<number, number>;
  isFirstTime: boolean;
  previousFixtureCount?: number;
  addedFixturesCount?: number;
  removedFixturesCount?: number;
  floorChangedFixturesCount?: number;
  unchangedFixturesCount?: number;
}

interface MakeLiveConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  stats: MakeLiveStats | null;
  storeName: string;
  isProcessing: boolean;
}

export function MakeLiveConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  stats,
  storeName,
  isProcessing,
}: MakeLiveConfirmationDialogProps) {
  if (!stats) return null;

  const totalChanges = (stats.addedFixturesCount || 0) + (stats.removedFixturesCount || 0);
  const changePercentage = stats.previousFixtureCount && stats.previousFixtureCount > 0
    ? (totalChanges / stats.previousFixtureCount) * 100
    : 0;

  const floorChangePercentage = stats.previousFixtureCount && stats.previousFixtureCount > 0
    ? ((stats.floorChangedFixturesCount || 0) / stats.previousFixtureCount) * 100
    : 0;

  const showFixtureChangeWarning = !stats.isFirstTime && changePercentage > 10;
  const showFloorChangeWarning = !stats.isFirstTime && floorChangePercentage >= 50;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        onCancel();
      } else {
        onOpenChange(newOpen);
      }
    }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>
              {stats.isFirstTime ? 'Make Store Live' : 'Update Live Store'}
            </DialogTitle>
            <DialogClose onClick={onCancel} />
          </div>
        </DialogHeader>

        <div className="p-6 pt-2 space-y-4">
          <div className="text-sm">
            <p className="mb-3 text-muted-foreground">
              Only one version can be live per Store ID. Make this live and override any existing live version?
            </p>

            <p className="font-medium mb-3">Store: {storeName}</p>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Floors:</span>
                <span className="font-medium">{stats.totalFloors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Fixtures:</span>
                <span className="font-medium">{stats.totalFixtures}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Brands:</span>
                <span className="font-medium">{stats.totalBrands}</span>
              </div>
            </div>

            <div className="border-t pt-3 mb-4">
              <p className="font-medium mb-2">Fixtures per Floor:</p>
              <div className="space-y-1 pl-4">
                {Object.entries(stats.fixturesPerFloor)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([floor, count]) => (
                    <div key={floor} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Floor {floor}:</span>
                      <span>{count} fixtures</span>
                    </div>
                  ))}
              </div>
            </div>

            {!stats.isFirstTime && stats.previousFixtureCount !== undefined && (
              <div className="border-t pt-3">
                <div className="space-y-2 mb-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Previous Version:</span>
                    <span className="font-medium">{stats.previousFixtureCount} fixtures</span>
                  </div>
                  {stats.unchangedFixturesCount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unchanged:</span>
                      <span>{stats.unchangedFixturesCount} fixtures</span>
                    </div>
                  )}
                  {stats.addedFixturesCount !== undefined && stats.addedFixturesCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Added:</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        +{stats.addedFixturesCount} fixtures
                      </span>
                    </div>
                  )}
                  {stats.removedFixturesCount !== undefined && stats.removedFixturesCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Removed:</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        -{stats.removedFixturesCount} fixtures
                      </span>
                    </div>
                  )}
                  {stats.floorChangedFixturesCount !== undefined && stats.floorChangedFixturesCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Floor Changed:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        {stats.floorChangedFixturesCount} fixtures ({floorChangePercentage.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>

                {showFixtureChangeWarning && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md mt-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <p className="font-medium mb-1">Warning: Significant Changes Detected</p>
                      <p>
                        More than 10% of fixtures have been added or removed ({totalChanges} fixtures = {changePercentage.toFixed(1)}%).
                        Please review the changes carefully before publishing.
                      </p>
                    </div>
                  </div>
                )}

                {showFloorChangeWarning && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md mt-3">
                    <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-medium mb-1">Notice: Floor Restructuring Detected</p>
                      <p>
                        {floorChangePercentage.toFixed(0)}% of fixtures have moved to different floors.
                        This may indicate floors have been renamed or reordered.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
