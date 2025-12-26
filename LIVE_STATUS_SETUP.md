# Live Status Feature - Setup Guide

This guide will help you set up the new Live Status tracking feature for store deployments.

## Overview

The Live Status feature tracks the deployment status of stores when they are made live via the `process3dzip` API. It provides:

- **Status Tracking**: Monitor deployment status (`deploying` → `in_process` → `live` or `failed`)
- **10-Minute Rule**: Automatically transitions from "in process" to "live" after 10 minutes
- **Deployment History**: View past deployments with metadata
- **Multiple Store Monitoring**: Track status for multiple stores simultaneously

## Setup Instructions

### Step 1: Run the Database Migration

1. Open your Supabase SQL Editor
2. Navigate to the migration file: `supabase_migrations/001_create_store_deployments.sql`
3. Copy and paste the entire SQL script into the SQL Editor
4. Execute the script

This will create:
- `store_deployments` table with all necessary columns
- Indexes for better query performance
- Row Level Security (RLS) policies
- Auto-update trigger for `updated_at` column

### Step 2: Verify the Migration

After running the migration, verify that the table was created successfully:

```sql
SELECT * FROM store_deployments LIMIT 1;
```

You should see the table structure with these columns:
- `id` (UUID)
- `store_id`, `store_name`, `entity`
- `status` (enum: deploying, in_process, live, failed)
- `deployed_at`, `live_at`
- `version`, `deployment_url`
- `metadata` (JSONB)
- `api_response` (JSONB)
- `error_message`
- `created_at`, `updated_at`

### Step 3: Access the Live Status Page

1. Start your development server: `npm run dev`
2. Navigate to the "My Stores" page
3. You'll now see two tabs:
   - **Archived Stores**: The existing store list
   - **Live Status**: The new deployment tracking page

## Features & Usage

### Deployment Status Flow

When you click "Make Live" on a store:

1. **Deploying**: The store is being processed by the API
2. **In Process**: The API returned success, waiting for 10 minutes
3. **Live**: After 10 minutes (or manual verification), the store is confirmed live
4. **Failed**: If the deployment encounters an error

### Status Indicators

- **Deploying**: Blue badge with spinner
- **In Process**: Yellow badge with countdown timer
- **Live**: Green badge with checkmark
- **Failed**: Red badge with error message

### Automatic Status Updates

The Live Status tab automatically:
- Polls every 30 seconds for status updates
- Transitions "deploying" to "in_process" immediately
- Transitions "in_process" to "live" after 10 minutes
- Shows countdown timer during "in_process" state

### Deployment History

Each deployment record includes:
- Store ID, name, and entity
- Deployment timestamp
- Live timestamp (when it went live)
- Store metadata (region, state, city, format, etc.)
- Total fixtures deployed
- API response data
- Error messages (if failed)

## Implementation Details

### Files Created/Modified

**New Files:**
1. `src/components/LiveStatusTab.tsx` - The main Live Status component
2. `supabase_migrations/001_create_store_deployments.sql` - Database schema
3. `LIVE_STATUS_SETUP.md` - This setup guide

**Modified Files:**
1. `src/services/supabaseService.ts` - Added deployment tracking methods:
   - `createDeployment()`
   - `listDeployments()`
   - `getLatestDeployment()`
   - `updateDeploymentStatus()`
   - `getActiveDeployments()`
   - `getDeploymentHistory()`

2. `src/components/MyCreatedStores.tsx` - Added:
   - Tabs UI for "Archived Stores" and "Live Status"
   - Integration with deployment tracking in `makeStoreLive` flow
   - Error handling to create failed deployment records

### TypeScript Interfaces

```typescript
interface StoreDeployment {
  store_id: string;
  store_name: string;
  entity: string;
  status: 'deploying' | 'in_process' | 'live' | 'failed';
  deployed_at?: string; // Optional when creating, required when returned from DB
  live_at?: string | null;
  version?: string | null;
  deployment_url?: string | null;
  metadata?: Record<string, any>;
  api_response?: any;
  error_message?: string | null;
}

interface StoreDeploymentRow extends StoreDeployment {
  id: string;
  deployed_at: string; // Required - always set by database
  created_at: string;
  updated_at: string;
}
```

## Configuration

### Customizing the 10-Minute Timer

If you need to adjust the 10-minute transition time, edit `src/components/LiveStatusTab.tsx`:

```typescript
const TEN_MINUTES_MS = 10 * 60 * 1000; // Change this value
```

### Customizing Polling Interval

To change how often the status updates:

```typescript
const POLL_INTERVAL_MS = 30 * 1000; // Change this value (in milliseconds)
```

### Customizing Deployment URL

By default, the "View Live" link uses:
```
https://stockflow-core.dg2n.com/{entity}/{store_id}
```

To customize this, edit the `getDeploymentUrl()` function in `LiveStatusTab.tsx`.

## Troubleshooting

### Issue: "Failed to fetch deployments"

**Solution:**
1. Verify the Supabase migration was run successfully
2. Check that RLS policies are enabled and correct
3. Ensure the user is authenticated

### Issue: Deployments stuck in "deploying" status

**Solution:**
- The automatic status transition happens every 30 seconds
- Wait for the next poll cycle or click the "Refresh" button

### Issue: No deployments showing

**Solution:**
1. Make a store live first to create a deployment record
2. Check the browser console for errors
3. Verify the Supabase table exists and has data

## Future Enhancements

Potential improvements to consider:

1. **Health Check API**: Add actual API calls to verify store is live (instead of 10-min timer)
2. **Rollback Functionality**: Allow reverting to previous versions
3. **Comparison View**: Compare live version with archived versions
4. **Notifications**: Browser notifications when store goes live
5. **Analytics Dashboard**: Deployment success rates, average deployment time, etc.
6. **Manual Status Override**: Allow admins to manually set status to "live"
7. **Deployment Logs**: Detailed logs of each deployment step

## Support

If you encounter any issues or have questions:
1. Check the browser console for errors
2. Check the Supabase logs for database errors
3. Review this documentation
4. Contact the development team

## Summary

You've successfully set up the Live Status tracking feature! You can now:
- Monitor store deployments in real-time
- View deployment history
- Track multiple stores simultaneously
- Automatically transition statuses based on time
- View deployment metadata and error messages

Navigate to the "My Stores" page and click on the "Live Status" tab to start using the feature.
