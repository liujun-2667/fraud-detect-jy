import { apiGet, apiPost, ApiResponse } from './client';
import {
  Case,
  CaseStats,
  CaseListFilter,
  CaseConclusion,
  PaginatedResponse,
} from '../types';

export const getCases = (
  params: CaseListFilter & { page: number; page_size: number },
): Promise<ApiResponse<PaginatedResponse<Case>>> => {
  return apiGet('/cases', { params });
};

export const getCaseById = (id: number): Promise<ApiResponse<Case>> => {
  return apiGet(`/cases/${id}`);
};

export const assignCase = (id: number): Promise<ApiResponse<Case>> => {
  return apiPost(`/cases/${id}/assign`);
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
