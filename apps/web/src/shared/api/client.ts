import axios from 'axios';
import { env } from '@/env';
import { useAuthStore } from '@/shared/stores/auth.store';

export const apiClient = axios.create({
  baseURL: env.API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token on every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Silent token refresh on 401
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function flushQueue(err: unknown, token: string | null) {
  pendingQueue.forEach((p) => (err ? p.reject(err) : p.resolve(token!)));
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: import('axios').AxiosError) => {
    const original = error.config as import('axios').InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;
    const { refreshToken, setTokens, logout } = useAuthStore.getState();

    try {
      const { data } = await axios.post(`${env.API_URL}/auth/refresh`, null, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      });
      const newAccess: string = data.data?.accessToken ?? data.accessToken;
      const newRefresh: string = data.data?.refreshToken ?? data.refreshToken;
      setTokens(newAccess, newRefresh);
      flushQueue(null, newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch (e) {
      flushQueue(e, null);
      logout();
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  },
);