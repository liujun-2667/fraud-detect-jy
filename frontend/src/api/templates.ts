import { apiGet, apiPost, apiPut, apiDelete, ApiResponse } from './client';
import {
  RuleTemplate,
  TemplateCategory,
  PaginatedResponse,
  TemplateUsageStat,
  TemplateRuleDiff,
} from '../types';

export const getTemplates = (
  params?: {
    page?: number;
    page_size?: number;
    category?: TemplateCategory;
    is_active?: boolean;
    keyword?: string;
    tag?: string;
    sort_by?: 'use_count' | 'created_at' | 'name';
    sort_order?: 'asc' | 'desc';
  },
): Promise<ApiResponse<PaginatedResponse<RuleTemplate>>> => {
  return apiGet('/templates', { params });
};

export const getTemplateById = (id: number): Promise<ApiResponse<RuleTemplate>> => {
  return apiGet(`/templates/${id}`);
};

export const createTemplate = (data: any): Promise<ApiResponse<RuleTemplate>> => {
  return apiPost('/templates', data);
};

export const updateTemplate = (id: number, data: any): Promise<ApiResponse<RuleTemplate>> => {
  return apiPut(`/templates/${id}`, data);
};

export const deleteTemplate = (id: number): Promise<ApiResponse<any>> => {
  return apiDelete(`/templates/${id}`);
};

export const toggleTemplateStatus = (id: number): Promise<ApiResponse<RuleTemplate>> => {
  return apiPost(`/templates/${id}/toggle`);
};

export const getTemplateUsageDistribution = (): Promise<ApiResponse<TemplateUsageStat[]>> => {
  return apiGet('/templates/stats/usage-distribution');
};

export const getRuleTemplateDiff = (versionId: number): Promise<ApiResponse<TemplateRuleDiff>> => {
  return apiGet(`/rules/versions/${versionId}/template-diff`);
};
