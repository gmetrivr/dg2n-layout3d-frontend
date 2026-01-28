import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Clock, XCircle, FileText, Download, ChevronLeft, ChevronRight, RefreshCw, Eye, Boxes, Filter, X } from 'lucide-react';
import { Button } from '@/shadcn/components/ui/button';
import { apiService, type JobListItem, type JobDetail } from '../services/api';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingJobs, setDownloadingJobs] = useState<Set<string>>(new Set());
  const [downloadingDetail, setDownloadingDetail] = useState(false);

  // Pagination & filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Column filters
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    filename: '',
    user: '',
  });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Original filter values (stored when filter opens, used to revert on cancel)
  const [originalFilters, setOriginalFilters] = useState<Record<string, string>>({
    filename: '',
    user: '',
    status: 'all',
  });

  // Ref for filter popup to detect outside clicks
  const filterPopupRef = useRef<HTMLDivElement>(null);
  // Ref for status select to auto-expand
  const statusSelectRef = useRef<HTMLSelectElement>(null);

  const fetchJobs = async () => {
    try {
      const params: any = {
        page,
        limit: 20,
        sort: 'createdAt' as const,
        order: 'desc' as const,
        allUsers: true,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await apiService.listJobs(params);
      setJobs(response.data.jobs);
      setTotalPages(response.data.pagination.pages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, statusFilter]);

  // Auto-refresh for active jobs
  useEffect(() => {
    if (!autoRefresh) return;

    const hasActiveJobs = jobs.some(job =>
      job.status === 'pending' || job.status === 'processing'
    );

    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      fetchJobs();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [jobs, autoRefresh, page, statusFilter]);

  // Handle click outside and Escape key for filters
  useEffect(() => {
    if (!activeFilter) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(event.target as Node)) {
        if (activeFilter === 'status') {
          // Status filter: clicking outside cancels (reverts)
          setStatusFilter(originalFilters.status as JobStatus | 'all');
        } else {
          // Filename/User filters: clicking outside keeps the value (commit)
          setOriginalFilters(prev => ({
            ...prev,
            [activeFilter]: columnFilters[activeFilter] || '',
          }));
        }
        setActiveFilter(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Escape always cancels - revert to original values
        setColumnFilters(prev => ({
          ...prev,
          filename: originalFilters.filename,
          user: originalFilters.user,
        }));
        setStatusFilter(originalFilters.status as JobStatus | 'all');
        setActiveFilter(null);
      } else if (event.key === 'Enter' && (activeFilter === 'filename' || activeFilter === 'user')) {
        // Enter commits the value for text filters
        setOriginalFilters(prev => ({
          ...prev,
          [activeFilter]: columnFilters[activeFilter] || '',
        }));
        setActiveFilter(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeFilter, originalFilters, columnFilters]);

  // Auto-expand status dropdown when opened
  useEffect(() => {
    if (activeFilter === 'status' && statusSelectRef.current) {
      // Small delay to ensure the element is rendered
      setTimeout(() => {
        if (statusSelectRef.current) {
          statusSelectRef.current.focus();
          // Use showPicker() to open the dropdown (supported in modern browsers)
          if (typeof statusSelectRef.current.showPicker === 'function') {
            try {
              statusSelectRef.current.showPicker();
            } catch (e) {
              // Fallback: showPicker may fail in some contexts, dropdown will still work on click
            }
          }
        }
      }, 0);
    }
  }, [activeFilter]);

  // Check if any filter is active
  const hasActiveFilters = statusFilter !== 'all' || columnFilters.filename || columnFilters.user;

  // Filter jobs based on column filters (status is server-side, others are client-side)
  const filteredJobs = jobs.filter((job) => {
    // Filename filter
    const filenameFilter = columnFilters.filename.toLowerCase();
    if (filenameFilter) {
      const filename = (job.filename || job.id).toLowerCase();
      if (!filename.includes(filenameFilter)) return false;
    }

    // User filter
    const userFilter = columnFilters.user.toLowerCase();
    if (userFilter) {
      const user = (job.username || job.user_id).toLowerCase();
      if (!user.includes(userFilter)) return false;
    }

    return true;
  });

  const handleFilterChange = (column: string, value: string) => {
    if (column === 'status') {
      setStatusFilter(value as JobStatus | 'all');
      setPage(1);
    } else {
      setColumnFilters(prev => ({ ...prev, [column]: value }));
    }
  };

  const clearColumnFilter = (column: string) => {
    if (column === 'status') {
      setStatusFilter('all');
      setPage(1);
    } else {
      setColumnFilters(prev => ({ ...prev, [column]: '' }));
    }
    // Update original so closing doesn't revert
    setOriginalFilters(prev => ({ ...prev, [column]: column === 'status' ? 'all' : '' }));
    setActiveFilter(null);
  };

  const toggleFilter = (column: string) => {
    if (activeFilter === column) {
      // Closing normally (not cancel) - keep current values
      setActiveFilter(null);
    } else {
      // Opening - store current values as original (for cancel/revert)
      setOriginalFilters({
        filename: columnFilters.filename,
        user: columnFilters.user,
        status: statusFilter,
      });
      setActiveFilter(column);
    }
  };

  const handleViewDetails = async (jobId: string) => {
    setLoadingDetail(true);
    try {
      const response = await apiService.getJobDetail(jobId);
      setSelectedJob(response.data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDownload = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingJobs(prev => new Set(prev).add(jobId));
    try {
      await apiService.downloadJobZip(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download files');
    } finally {
      setDownloadingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const handleVisualize = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/3d-viewer-modifier?jobId=${jobId}`);
  };

  const handleDownloadDetailZip = async () => {
    if (!selectedJob) return;
    setDownloadingDetail(true);
    try {
      await apiService.downloadJobZip(selectedJob.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download files');
    } finally {
      setDownloadingDetail(false);
    }
  };

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-900 dark:text-green-100" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-900 dark:text-red-100" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-900 dark:text-blue-100" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-900 dark:text-gray-100" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-900 dark:text-yellow-300" />;
    }
  };

  const getStatusBadge = (status: JobStatus, workerId?: string, progressPercent?: number) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 relative overflow-hidden min-w-[130px] justify-center";
    const statusClasses = {
      pending: "text-yellow-900 dark:text-yellow-300",
      processing: "text-blue-900 dark:text-blue-100",
      completed: "text-green-900 dark:text-green-100",
      failed: "text-red-900 dark:text-red-100",
      cancelled: "text-gray-900 dark:text-gray-100",
    };

    const tooltip = status === 'processing' && workerId ? `Worker: ${workerId}` : undefined;

    // For processing status with progress, show progress bar background
    const showProgress = status === 'processing' && progressPercent !== undefined;
    const progress = progressPercent || 0;

    return (
      <span className={`${baseClasses} ${statusClasses[status]}`} title={tooltip}>
        {/* Background base layer */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: status === 'processing'
              ? 'rgb(219 234 254)' // blue-100
              : status === 'pending'
              ? 'rgb(254 240 138)' // yellow-300
              : status === 'completed'
              ? 'rgb(187 247 208)' // green-200
              : status === 'failed'
              ? 'rgb(254 202 202)' // red-200
              : 'rgb(229 231 235)' // gray-200
          }}
        />
        {/* Dark mode background base layer */}
        <span
          className="absolute inset-0 rounded-full hidden dark:block"
          style={{
            backgroundColor: status === 'processing'
              ? 'rgb(30 58 138 / 0.5)' // blue-900/50
              : status === 'pending'
              ? 'rgb(113 63 18 / 0.5)' // yellow-900/50
              : status === 'completed'
              ? 'rgb(20 83 45 / 0.5)' // green-900/50
              : status === 'failed'
              ? 'rgb(127 29 29 / 0.5)' // red-900/50
              : 'rgb(55 65 81 / 0.5)' // gray-700/50
          }}
        />
        {/* Progress fill layer (only for processing) */}
        {status === 'processing' && (
          <>
            <span
              className="absolute inset-0 rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                backgroundColor: 'rgb(59 130 246)', // blue-500
              }}
            />
            <span
              className="absolute inset-0 rounded-full transition-all duration-300 hidden dark:block"
              style={{
                width: `${progress}%`,
                backgroundColor: 'rgb(37 99 235)', // blue-600
              }}
            />
          </>
        )}
        <span className="relative z-10 flex items-center gap-1">
          {getStatusIcon(status)}
          {status.charAt(0).toUpperCase() + status.slice(1)}
          {showProgress && <span className="ml-1">({progress}%)</span>}
        </span>
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-muted-foreground">Loading jobs...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Job Queue</h1>
        <p className="text-muted-foreground">Monitor and manage your processing jobs</p>
      </div>

      {/* Controls */}
      <div className="flex justify-end gap-2 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchJobs()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 border rounded-lg border-destructive/20 bg-destructive/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Jobs table */}
      {jobs.length === 0 && !hasActiveFilters ? (
        <div className="text-center py-12 border rounded-lg">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No jobs found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <span>Status</span>
                        <button
                          onClick={() => toggleFilter('status')}
                          className={`p-1 hover:bg-muted rounded ${statusFilter !== 'all' ? 'text-primary' : ''}`}
                        >
                          <Filter className="h-3 w-3" />
                        </button>
                      </div>
                      {activeFilter === 'status' && (
                        <div
                          ref={filterPopupRef}
                          className="absolute top-full left-0 mt-1 z-20 bg-background border border-border rounded-md shadow-lg"
                        >
                          <select
                            ref={statusSelectRef}
                            value={statusFilter}
                            onChange={(e) => {
                              handleFilterChange('status', e.target.value);
                              setOriginalFilters(prev => ({ ...prev, status: e.target.value }));
                              setActiveFilter(null);
                            }}
                            className="px-2 py-1 text-sm font-normal normal-case bg-background border-0 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="all">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="processing">Processing</option>
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <span>Filename</span>
                        <button
                          onClick={() => toggleFilter('filename')}
                          className={`p-1 hover:bg-muted rounded ${columnFilters.filename ? 'text-primary' : ''}`}
                        >
                          <Filter className="h-3 w-3" />
                        </button>
                      </div>
                      {activeFilter === 'filename' && (
                        <div
                          ref={filterPopupRef}
                          className="absolute top-full left-0 mt-1 z-20 bg-background border border-border rounded-md shadow-lg min-w-[200px]"
                        >
                          <div className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Search..."
                                value={columnFilters.filename}
                                onChange={(e) => handleFilterChange('filename', e.target.value)}
                                className="flex-1 px-2 py-1 text-sm font-normal normal-case bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                              />
                              <button
                                onClick={() => clearColumnFilter('filename')}
                                className="p-1 hover:bg-muted rounded"
                                title="Clear filter"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <span>User</span>
                        <button
                          onClick={() => toggleFilter('user')}
                          className={`p-1 hover:bg-muted rounded ${columnFilters.user ? 'text-primary' : ''}`}
                        >
                          <Filter className="h-3 w-3" />
                        </button>
                      </div>
                      {activeFilter === 'user' && (
                        <div
                          ref={filterPopupRef}
                          className="absolute top-full left-0 mt-1 z-20 bg-background border border-border rounded-md shadow-lg min-w-[180px]"
                        >
                          <div className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Search..."
                                value={columnFilters.user}
                                onChange={(e) => handleFilterChange('user', e.target.value)}
                                className="flex-1 px-2 py-1 text-sm font-normal normal-case bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                              />
                              <button
                                onClick={() => clearColumnFilter('user')}
                                className="p-1 hover:bg-muted rounded"
                                title="Clear filter"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12">
                      <div className="text-center">
                        <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No jobs match your filters</p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setColumnFilters({ filename: '', user: '' });
                            setStatusFilter('all');
                            setActiveFilter(null);
                          }}
                          className="mt-2"
                        >
                          Clear filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleViewDetails(job.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(job.status, job.worker_id, job.progress_percent)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground truncate block max-w-xs" title={job.filename || job.id}>
                          {job.filename || `Job ${job.id.substring(0, 8)}...`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-foreground truncate block max-w-xs" title={job.username || job.user_id}>
                          {job.username || `${job.user_id.substring(0, 8)}...`}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(job.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {job.started_at ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDate(job.started_at)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {job.completed_at ? (
                          <span className="text-sm text-muted-foreground">
                            {formatDate(job.completed_at)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(job.id);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {job.status === 'completed' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDownload(job.id, e)}
                                disabled={downloadingJobs.has(job.id)}
                                title="Download Files"
                              >
                                {downloadingJobs.has(job.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleVisualize(job.id, e)}
                                title="Visualize 3D Model"
                              >
                                <Boxes className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Job Detail Modal/Panel */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="bg-background border rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Job Details</h2>
                    <p className="text-sm font-mono text-muted-foreground">{selectedJob.id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedJob(null)}
                  >
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>

                {/* Status and Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {selectedJob.filename && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">Filename</p>
                      <p className="text-sm font-medium">{selectedJob.filename}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    {getStatusBadge(selectedJob.status, selectedJob.worker_id, selectedJob.progress_percent)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">User</p>
                    <p className="text-sm">{selectedJob.username || selectedJob.user_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Created</p>
                    <p className="text-sm">{new Date(selectedJob.created_at).toLocaleString()}</p>
                  </div>
                  {selectedJob.started_at && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Started</p>
                      <p className="text-sm">{new Date(selectedJob.started_at).toLocaleString()}</p>
                    </div>
                  )}
                  {selectedJob.completed_at && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Completed</p>
                      <p className="text-sm">{new Date(selectedJob.completed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {selectedJob.error_message && (
                  <div className="mb-6 p-4 border rounded-lg border-destructive/20 bg-destructive/5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive mb-1">Error</p>
                        <p className="text-sm text-destructive">{selectedJob.error_message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress */}
                {selectedJob.progress && selectedJob.progress.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Script Progress</h3>
                    <div className="space-y-3">
                      {selectedJob.progress.map((script) => (
                        <div key={script.script_number} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(script.status)}
                              <span className="font-medium">
                                {script.script_number}. {script.script_name}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {script.progress_percent}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2 mb-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${script.progress_percent}%` }}
                            />
                          </div>
                          {script.log_messages && script.log_messages.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground space-y-1">
                              {script.log_messages.slice(-3).map((msg, idx) => (
                                <p key={idx}>{msg}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Files */}
                {selectedJob.inputFiles && selectedJob.inputFiles.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Input Files</h3>
                    <div className="space-y-2">
                      {selectedJob.inputFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{file.originalName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.fileSize)} • {file.fileType}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(file.downloadUrl, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Download Output Files */}
                {selectedJob.status === 'completed' && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Output Files</h3>
                    <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/30">
                      <p className="text-sm text-muted-foreground mb-3">
                        All output files are available for download as a ZIP archive
                      </p>
                      <Button
                        onClick={handleDownloadDetailZip}
                        disabled={downloadingDetail}
                        className="w-full"
                      >
                        {downloadingDetail ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Download All Output Files (ZIP)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
