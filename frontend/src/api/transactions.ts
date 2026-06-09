import { apiGet, apiPost, ApiResponse } from './client';
import { Transaction, PaginatedResponse, Evaluation } from '../types';

export const evaluateTransaction = (data: any): Promise<ApiResponse<Evaluation>> => {
  return apiPost('/transactions/evaluate', data);
};

export const getTransactions = (params?: any): Promise<ApiResponse<PaginatedResponse<Transaction>>> => {
  return apiGet('/transactions', { params });
};

export const getTransactionById = (id: number): Promise<ApiResponse<Transaction>> => {
  return apiGet(`/transactions/${id}`);
};

export const getTransactionEvaluations = (id: number): Promise<ApiResponse<Evaluation[]>> => {
  return apiGet(`/transactions/${id}/evaluations`);
};

export const getTransactionsByCard = (
  cardHash: string,
  params?: any,
): Promise<ApiResponse<PaginatedResponse<Transaction>>> => {
  return apiGet(`/transactions/card/${cardHash}`, { params });
};

export const exportTransactionsCsv = (startTime: string, endTime: string) => {
  window.open(`/api/v1/transactions/export/csv?start_time=${startTime}&end_time=${endTime}`, '_blank');
};
