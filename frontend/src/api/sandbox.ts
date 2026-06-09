import { apiGet, apiPost, ApiResponse } from './client';
import { SandboxTest } from '../types';

export const createSandboxTest = (data: any): Promise<ApiResponse<SandboxTest>> => {
  return apiPost('/sandbox/tests', data);
};

export const getSandboxTest = (id: string): Promise<ApiResponse<SandboxTest>> => {
  return apiGet(`/sandbox/tests/${id}`);
};

export const getSandboxTests = (): Promise<ApiResponse<SandboxTest[]>> => {
  return apiGet('/sandbox/tests');
};
