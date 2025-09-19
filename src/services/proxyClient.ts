import { useMemo } from 'react';

import { useAuth } from '../contexts/AuthContext';

// Prefer same-origin in non-local environments to avoid CORS.
// This lets Vercel rewrites (see vercel.json) proxy /api/* to the guard.
// In local dev, fall back to VITE_PROXY_BASE_URL if provided.
const computeBaseUrl = () => {
  const envUrl = (import.meta.env.VITE_PROXY_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  if (typeof window === 'undefined') return envUrl;
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  // If VITE_PROXY_BASE_URL is explicitly set, always use it
  // Otherwise, use same-origin (empty string) to rely on Vercel rewrites
  const result = envUrl ? envUrl : '';
  console.log(`[ProxyClient] Environment: ${isLocal ? 'local' : 'production'}, envUrl: "${envUrl}", baseUrl: "${result}"`);
  return result;
};

const baseUrl = computeBaseUrl();

export type Operator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is'
  | 'in'
  | 'contains'
  | 'containedBy';

export type Filter = {
  column: string;
  operator: Operator;
  value: unknown;
};

export type DbRequest = {
  table: string;
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  columns?: string;
  filters?: Filter[];
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
  upsertOptions?: {
    onConflict?: string;
    ignoreDuplicates?: boolean;
  };
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: BodyInit | object | null;
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob';
  searchParams?: Record<string, string | number | boolean | undefined>;
};

type JsonResponse<T> = {
  data: T;
};

type UploadOptions = {
  bucket: string;
  path: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  upsert?: boolean;
};

type DownloadOptions = {
  bucket: string;
  path: string;
};

type RemoveOptions = {
  bucket: string;
  paths: string[];
};

type PublicUrlOptions = {
  bucket: string;
  path: string;
};

type SignedUrlOptions = {
  bucket: string;
  path: string;
  expiresIn?: number;
};

export type ProxyClient = {
  db: <T>(request: DbRequest) => Promise<T>;
  rpc: <T>(functionName: string, params?: Record<string, unknown>) => Promise<T>;
  storage: {
    upload: (options: UploadOptions) => Promise<{ path: string }>;
    download: (options: DownloadOptions) => Promise<Blob>;
    remove: (options: RemoveOptions) => Promise<void>;
    publicUrl: (options: PublicUrlOptions) => Promise<string>;
    signedUrl: (options: SignedUrlOptions) => Promise<string>;
  };
};

const resolveUrl = (path: string, searchParams?: RequestOptions['searchParams']) => {
  const params = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null) continue;
      params.append(key, String(value));
    }
  }

  const query = params.toString();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = baseUrl || '';
  const finalUrl = `${prefix}${normalizedPath}${query ? `?${query}` : ''}`;

  console.log(`[ProxyClient] Resolving URL: ${path} -> ${finalUrl}`);
  return finalUrl;
};

const isJsonBody = (body: unknown): body is Record<string, unknown> | Array<unknown> =>
  typeof body === 'object' && body !== null && !(body instanceof ArrayBuffer) && !(body instanceof Blob) && !(body instanceof FormData) && !(body instanceof Uint8Array);

const normalizeBody = (body?: RequestOptions['body']) => {
  if (!body) return { payload: undefined, isJson: false };
  if (body instanceof Uint8Array) {
    return { payload: body, isJson: false };
  }
  if (body instanceof ArrayBuffer) {
    return { payload: body, isJson: false };
  }
  if (body instanceof Blob) {
    return { payload: body, isJson: false };
  }
  if (body instanceof FormData) {
    return { payload: body, isJson: false };
  }
  if (isJsonBody(body)) {
    return { payload: JSON.stringify(body), isJson: true };
  }
  return { payload: body as BodyInit, isJson: false };
};

const parseError = async (response: Response) => {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error as string;
    }
  } catch (_) {
    // ignore json parse errors
  }
  return response.statusText || 'Request failed';
};

const request = async <T>(token: string, path: string, options: RequestOptions = {}) => {
  const { method = 'GET', body, headers = {}, responseType = 'json', searchParams } = options;
  const url = resolveUrl(path, searchParams);
  const { payload, isJson } = normalizeBody(body);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${token}`,
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: payload,
  });

  if (!response.ok) {
    const message = await parseError(response);
    throw new Error(message);
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T;
  }

  return (await response.json()) as T;
};

export const buildBasicToken = (username: string, password: string) => {
  if (typeof btoa === 'function') {
    return btoa(`${username}:${password}`);
  }

  const nodeBuffer = (globalThis as typeof globalThis & {
    Buffer?: {
      from: (value: string, encoding: string) => { toString: (encoding: string) => string };
    };
  }).Buffer;

  if (nodeBuffer) {
    return nodeBuffer.from(`${username}:${password}`, 'utf8').toString('base64');
  }

  throw new Error('No base64 encoder available in this environment.');
};

export const verifyToken = async (token: string) => {
  await request<{ status: string }>(token, '/api/health');
};

export const createProxyClient = (token: string): ProxyClient => ({
  db: async <T>(requestBody: DbRequest) => {
    const response = await request<JsonResponse<T>>(token, '/api/db', {
      method: 'POST',
      body: requestBody,
    });

    return response.data;
  },
  rpc: async <T>(functionName: string, params?: Record<string, unknown>) => {
    const response = await request<JsonResponse<T>>(token, `/api/rpc/${encodeURIComponent(functionName)}`, {
      method: 'POST',
      body: params ?? {},
    });

    return response.data;
  },
  storage: {
    upload: async ({ bucket, path, body, contentType = 'application/octet-stream', upsert = true }) => {
      const response = await request<JsonResponse<{ path: string }>>(token, '/api/storage/upload', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': contentType,
        },
        searchParams: {
          bucket,
          path,
          upsert,
        },
      });

      return response.data;
    },
    download: async ({ bucket, path }) => {
      return request<Blob>(token, '/api/storage/download', {
        method: 'GET',
        responseType: 'blob',
        searchParams: {
          bucket,
          path,
        },
      });
    },
    remove: async ({ bucket, paths }) => {
      await request(token, '/api/storage/remove', {
        method: 'POST',
        body: {
          bucket,
          paths,
        },
      });
    },
    publicUrl: async ({ bucket, path }) => {
      const response = await request<{ publicUrl: string }>(token, '/api/storage/public-url', {
        method: 'POST',
        body: {
          bucket,
          path,
        },
      });

      return response.publicUrl;
    },
    signedUrl: async ({ bucket, path, expiresIn = 60 }) => {
      const response = await request<{ signedUrl: string }>(token, '/api/storage/signed-url', {
        method: 'POST',
        body: {
          bucket,
          path,
          expiresIn,
        },
      });

      return response.signedUrl;
    },
  },
});

export const useProxyClient = () => {
  const { authToken } = useAuth();

  if (!authToken) {
    throw new Error('useProxyClient must be used while authenticated');
  }

  return useMemo(() => createProxyClient(authToken), [authToken]);
};