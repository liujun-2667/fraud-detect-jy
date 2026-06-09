import { apiGet, apiPost, ApiResponse } from './client';
import {
  Case,
  CaseStats,
  CaseListFilter,
  CaseConclusion,
  PaginatedResponse,
  AnalystInfo,
} from '../types';

export const getCases = (
  params: CaseListFilter & { page: number; page_size: number },
): Promise<ApiResponse<PaginatedResponse<Case>>> => {
  return apiGet('/cases', { params });
};

export const getCaseById = (id: number): Promise<ApiResponse<Case>> => {
  return apiGet(`/cases/${id}`);
};

export const getAnalysts = (): Promise<ApiResponse<AnalystInfo[]>> => {
  return apiGet('/cases/analysts');
};

export const assignCase = (id: number): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/assign`);
};

export const autoAssignCase = (id: number): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/auto-assign`);
};

export const transferCase = (
  id: number,
  data: { target_user_id: string; target_user_name: string; reason: string },
): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/transfer`, data);
};

export const closeCase = (
  id: number,
  data: { conclusion: CaseConclusion; conclusion_note: string },
): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/close`, data);
};

export const addCaseNote = (
  id: number,
  data: { content: string },
): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/notes`, data);
};

export const getCaseStats = (): Promise<ApiResponse<CaseStats>> => {
  return apiGet('/cases/stats');
};

export const checkOvertime = (): Promise<ApiResponse<Case[]>> => {
  return apiPost('/cases/check-overtime');
};
