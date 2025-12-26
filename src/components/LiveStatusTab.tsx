import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useSupabaseService, type StoreDeploymentRow } from '../services/supabaseService';

const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const POLL_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

export default function LiveStatusTab() {
  const supabaseService = useSupabaseService();
  const [deployments, setDeployments] = useState<StoreDeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDeployments = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const data = await supabaseService.listDeployments(undefined, 100);

      // Filter to show only latest deployment per store_id
      const latestByStore = new Map<string, StoreDeploymentRow>();
      for (const deployment of data) {
        const existing = latestByStore.get(deployment.store_id);
        if (!existing || new Date(deployment.deployed_at) > new Date(existing.deployed_at)) {
          latestByStore.set(deployment.store_id, deployment);
        }
      }

      const latestDeployments = Array.from(latestByStore.values()).sort(
        (a, b) => new Date(b.deployed_at).getTime() - new Date(a.deployed_at).getTime()
      );

      setDeployments(latestDeployments);

      // Check if any deployments need status updates
      await checkAndUpdateStatuses(latestDeployments);
    } catch (err) {
      console.error('Failed to fetch deployments:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const checkAndUpdateStatuses = async (currentDeployments: StoreDeploymentRow[]) => {
    const now = new Date().getTime();
    const updates: Promise<any>[] = [];

    for (const deployment of currentDeployments) {
      // Only process deployments in 'deploying' or 'in_process' status
      if (deployment.status === 'deploying' || deployment.status === 'in_process') {
        const deployedAt = new Date(deployment.deployed_at).getTime();
        const elapsed = now - deployedAt;

        // If 10 minutes have passed, transition to 'live'
        if (elapsed >= TEN_MINUTES_MS) {
          updates.push(
            supabaseService.updateDeploymentStatus(deployment.id, 'live')
          );
        } else if (deployment.status === 'deploying') {
          // Transition from 'deploying' to 'in_process' immediately
          updates.push(
            supabaseService.updateDeploymentStatus(deployment.id, 'in_process')
          );
        }
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      // Refresh the list after updates
      const updatedData = await supabaseService.listDeployments(undefined, 100);
      setDeployments(updatedData);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDeployments(false);
  };

  useEffect(() => {
    fetchDeployments();

    // Set up polling interval to check for status updates
    const interval = setInterval(() => {
      fetchDeployments(false);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'deploying':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200">
            <Loader2 className="w-3 h-3 animate-spin" />
            Deploying
          </span>
        );
      case 'in_process':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200">
            <Clock className="w-3 h-3" />
            In Process
          </span>
        );
      case 'live':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200">
            <CheckCircle className="w-3 h-3" />
            Live
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return <span className="text-muted-foreground">{status}</span>;
    }
  };

  const getTimeRemaining = (deployedAt: string) => {
    const now = new Date().getTime();
    const deployed = new Date(deployedAt).getTime();
    const elapsed = now - deployed;
    const remaining = TEN_MINUTES_MS - elapsed;

    if (remaining <= 0) return 'Transitioning...';

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${minutes}m ${seconds}s remaining`;
  };

  const getDeploymentUrl = (deployment: StoreDeploymentRow) => {
    // Construct URL based on entity and store_id
    // Adjust this based on your actual URL structure
    if (deployment.deployment_url) {
      return deployment.deployment_url;
    }

    // Fallback: construct from entity and store_id
    const baseUrl = 'https://stockflow-core.dg2n.com'; // Adjust as needed
    return `${baseUrl}/${deployment.entity}/${deployment.store_id}`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Error loading deployments</span>
        </div>
        <p className="mt-2 text-sm text-destructive">{error}</p>
        <button
          onClick={() => fetchDeployments()}
          className="mt-3 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Live Deployment Status</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track deployment status and history for all stores
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {deployments.length === 0 ? (
        <div className="text-center py-12 bg-muted rounded-lg">
          <p className="text-foreground">No deployments found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use the "Make Live" button in the Archived Stores tab to deploy a store
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-card border border-border rounded-lg">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Version
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Store ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Store Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Deployed At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Went Live At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {deployments.map((deployment) => (
                <tr key={deployment.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {deployment.version || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">
                    {deployment.store_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                    {deployment.store_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    <div className="flex flex-col">
                      <span>{formatTimestamp(deployment.deployed_at)}</span>
                      <span className="text-xs text-muted-foreground">{getRelativeTime(deployment.deployed_at)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {deployment.live_at ? (
                      <div className="flex flex-col">
                        <span>{formatTimestamp(deployment.live_at)}</span>
                        <span className="text-xs text-muted-foreground">{getRelativeTime(deployment.live_at)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(deployment.status)}
                      {deployment.status === 'in_process' && (
                        <span className="text-xs text-yellow-700 dark:text-yellow-300">
                          {getTimeRemaining(deployment.deployed_at)}
                        </span>
                      )}
                      {deployment.error_message && (
                        <span className="text-xs text-destructive truncate max-w-xs" title={deployment.error_message}>
                          {deployment.error_message}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {deployment.status === 'live' && (
                      <a
                        href={getDeploymentUrl(deployment)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
