import { apiGet, apiPost, apiPut, ApiResponse } from './client';
import { Rule, RuleType, RuleVersionStatus, PaginatedResponse, RuleVersion, AuditLog } from '../types';

export const getRules = (
  params?: { page?: number; page_size?: number; rule_type?: RuleType; status?: RuleVersionStatus; keyword?: string },
): Promise<ApiResponse<PaginatedResponse<Rule>>> => {
  return apiGet('/rules', { params });
};

export const getRuleById = (id: number): Promise<ApiResponse<Rule>> => {
  return apiGet(`/rules/${id}`);
};

export const createRule = (data: any): Promise<ApiResponse<Rule>> => {
  return apiPost('/rules', data);
};

export const modifyActiveRule = (id: number, data: any): Promise<ApiResponse<Rule>> => {
  return apiPut(`/rules/${id}`, data);
};

export const submitForReview = (id: number): Promise<ApiResponse<RuleVersion>> => {
  return apiPost(`/rules/${id}/submit`);
};

export const approveRule = (id: number, versionId: number): Promise<ApiResponse<RuleVersion>> => {
  return apiPost(`/rules/${id}/approve/${versionId}`);
};

export const rejectRule = (
  id: number,
  versionId: number,
  reason: string,
): Promise<ApiResponse<RuleVersion>> => {
  return apiPost(`/rules/${id}/reject/${versionId}`, { reason });
};

export const disableRule = (id: number, versionId: number): Promise<ApiResponse<RuleVersion>> => {
  return apiPost(`/rules/${id}/disable/${versionId}`);
};

export const getRuleVersions = (id: number): Promise<ApiResponse<RuleVersion[]>> => {
  return apiGet(`/rules/${id}/versions`);
};

export const compareVersions = (v1: number, v2: number): Promise<ApiResponse<any>> => {
  return apiGet('/rules/versions/compare', { params: { v1, v2 } });
};

export const getAuditLogs = (params?: any): Promise<ApiResponse<PaginatedResponse<AuditLog>>> => {
  return apiGet('/rules/audit-logs', { params });
};
