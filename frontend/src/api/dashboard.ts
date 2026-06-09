import { apiGet, ApiResponse } from './client';
import {
  DashboardOverview,
  TrendPoint,
  RuleHitStat,
  HeatmapPoint,
  PaginatedResponse,
  Transaction,
} from '../types';

export const getDashboardOverview = (days = 24): Promise<ApiResponse<DashboardOverview>> => {
  return apiGet('/dashboard/overview', { params: { days } });
};

export const getTrend = (days = 7): Promise<ApiResponse<TrendPoint[]>> => {
  return apiGet('/dashboard/trend', { params: { days } });
};

export const getRuleHitStats = (): Promise<ApiResponse<RuleHitStat[]>> => {
  return apiGet('/dashboard/rules/hit-stats');
};

export const getRegionHeatmap = (): Promise<ApiResponse<HeatmapPoint[]>> => {
  return apiGet('/dashboard/heatmap/region');
};

export const getHourHeatmap = (): Promise<ApiResponse<HeatmapPoint[]>> => {
  return apiGet('/dashboard/heatmap/hour');
};

export const getAmountRangeHeatmap = (): Promise<ApiResponse<HeatmapPoint[]>> => {
  return apiGet('/dashboard/heatmap/amount-range');
};

export const getAlertStats = (days = 7): Promise<ApiResponse<any>> => {
  return apiGet('/dashboard/alerts', { params: { days } });
};

export const getRuleTransactions = (
  ruleId: number,
  params?: any,
): Promise<ApiResponse<PaginatedResponse<Transaction>>> => {
  return apiGet(`/dashboard/rules/${ruleId}/transactions`, { params });
};
