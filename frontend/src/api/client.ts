import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export const apiGet = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
  return client.get(url, config);
};

export const apiPost = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> => {
  return client.post(url, data, config);
};

export const apiPut = <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> => {
  return client.put(url, data, config);
};

export const apiDelete = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> => {
  return client.delete(url, config);
};

export default client;
