export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type RuleType = 'threshold' | 'association' | 'behavior';
export type RuleVersionStatus = 'draft' | 'reviewing' | 'active' | 'disabled';
export type DecisionType = 'allow' | 'review' | 'block';

export interface ThresholdRuleConfig {
  field: string;
  operator: string;
  value: any;
  unit?: string;
}

export interface RuleVersion {
  id: number;
  rule_id: number;
  version_num: number;
  config: {
    threshold?: ThresholdRuleConfig;
    association?: any;
    behavior?: any;
  };
  weight: number;
  priority: number;
  status: RuleVersionStatus;
  is_immediate_block: boolean;
  logic_expression: any;
  created_by?: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  activated_at?: string;
  source_template_id?: number;
  source_template_name?: string;
  template_snapshot?: any;
}

export type TemplateCategory =
  | 'amount'
  | 'frequency'
  | 'geography'
  | 'time'
  | 'device'
  | 'behavior';

export interface RuleTemplate {
  id: number;
  name: string;
  description?: string;
  category: TemplateCategory;
  applicable_scene?: string;
  rule_type: RuleType;
  config: {
    threshold?: ThresholdRuleConfig;
    association?: any;
    behavior?: any;
  };
  default_weight: number;
  default_priority: number;
  default_is_immediate_block: boolean;
  default_logic_expression: any;
  tags: string[];
  use_count: number;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface TemplateUsageStat {
  template_id: number;
  template_name: string;
  use_count: number;
  percentage: number;
}

export interface TemplateDiffItem {
  field: string;
  template_value: any;
  rule_value: any;
}

export interface TemplateRuleDiff {
  template_id: number;
  template_name: string;
  diffs: TemplateDiffItem[];
}

export interface Rule {
  id: number;
  name: string;
  description?: string;
  rule_type: RuleType;
  created_at: string;
  versions: RuleVersion[];
}

export interface RuleHit {
  rule_version_id: number;
  rule_name: string;
  weight: number;
  score: number;
  is_hit: boolean;
}

export interface Evaluation {
  id: number;
  transaction_id: number;
  risk_score: number;
  decision: DecisionType;
  rule_hits: RuleHit[];
  execution_ms: number;
  created_at: string;
}

export interface Transaction {
  id: number;
  transaction_no: string;
  card_no: string;
  card_hash: string;
  device_id?: string;
  amount: number;
  merchant_id?: string;
  merchant_name?: string;
  region?: string;
  region_code?: string;
  is_overseas: boolean;
  transaction_time: string;
  lat?: number;
  lng?: number;
  evaluation?: Evaluation;
}

export interface AuditLog {
  id: number;
  operator: string;
  action: string;
  rule_id?: number;
  rule_version_id?: number;
  old_status?: string;
  new_status?: string;
  detail?: any;
  created_at: string;
  ip_address: string;
}

export interface DashboardOverview {
  total_transactions: number;
  block_count: number;
  review_count: number;
  allow_count: number;
  block_rate: number;
  false_positive_rate: number;
}

export interface TrendPoint {
  date: string;
  total: number;
  block: number;
  review: number;
  allow: number;
}

export interface RuleHitStat {
  rule_id: number;
  rule_name: string;
  hit_count: number;
  block_contribution: number;
}

export interface HeatmapPoint {
  region_code?: string;
  region?: string;
  hour?: number;
  range_label?: string;
  total_count: number;
  high_risk_count: number;
  risk_ratio: number;
}

export interface SandboxTest {
  id: string;
  status: 'running' | 'completed' | 'failed';
  total_transactions: number;
  hit_count: number;
  estimated_hit_rate: number;
  estimated_block_rate: number;
  estimated_miss_rate: number;
  created_at: string;
  sample_results: any[];
}
