import { create } from 'zustand';
import dayjs from 'dayjs';
import {
  Case,
  CaseStatus,
  CaseRiskLevel,
  CaseConclusion,
  CaseStats,
  CaseListFilter,
  CaseNote,
  Transaction,
  CaseRuleHit,
  CaseHistoryTxn,
  DecisionType,
  PaginatedResponse,
} from '../types';
import {
  getCases as apiGetCases,
  getCaseById as apiGetCaseById,
  assignCase as apiAssignCase,
  closeCase as apiCloseCase,
  addCaseNote as apiAddCaseNote,
  getCaseStats as apiGetCaseStats,
} from '../api/cases';

const scoreToRiskLevel = (score: number): CaseRiskLevel => {
  if (score >= 71) return 'high';
  if (score >= 41) return 'medium';
  return 'low';
};

const generateCaseNo = (date: string, seq: number): string => {
  const dateStr = dayjs(date).format('YYYYMMDD');
  return `CAS-${dateStr}-${String(seq).padStart(4, '0')}`;
};

const mockTransactions: Transaction[] = [
  {
    id: 1001,
    transaction_no: 'TX202606090001',
    card_no: '6222****8888',
    card_hash: 'a1b2c3d4e5f6g7h8',
    device_id: 'DEV-9A3B-7C2D',
    amount: 88000,
    merchant_id: 'M001',
    merchant_name: '高端奢侈品旗舰店',
    region: '上海市',
    region_code: 'CN-SH',
    is_overseas: false,
    transaction_time: '2026-06-09T10:23:45Z',
    lat: 31.2304,
    lng: 121.4737,
  },
  {
    id: 1002,
    transaction_no: 'TX202606090002',
    card_no: '6225****1234',
    card_hash: 'b2c3d4e5f6g7h8i9',
    device_id: 'DEV-8X1Y-5Z4W',
    amount: 25000,
    merchant_id: 'M002',
    merchant_name: '境外数码商城',
    region: '香港',
    region_code: 'HK',
    is_overseas: true,
    transaction_time: '2026-06-09T09:15:30Z',
    lat: 22.3193,
    lng: 114.1694,
  },
  {
    id: 1003,
    transaction_no: 'TX202606090003',
    card_no: '6228****5678',
    card_hash: 'c3d4e5f6g7h8i9j0',
    device_id: 'DEV-3P5Q-9R2S',
    amount: 5000,
    merchant_id: 'M003',
    merchant_name: '本地超市连锁',
    region: '北京市',
    region_code: 'CN-BJ',
    is_overseas: false,
    transaction_time: '2026-06-09T08:45:12Z',
    lat: 39.9042,
    lng: 116.4074,
  },
  {
    id: 1004,
    transaction_no: 'TX202606080004',
    card_no: '6217****9999',
    card_hash: 'd4e5f6g7h8i9j0k1',
    device_id: 'DEV-7T4U-1V6W',
    amount: 156000,
    merchant_id: 'M004',
    merchant_name: '海外珠宝商城',
    region: '新加坡',
    region_code: 'SG',
    is_overseas: true,
    transaction_time: '2026-06-08T22:10:00Z',
    lat: 1.3521,
    lng: 103.8198,
  },
  {
    id: 1005,
    transaction_no: 'TX202606080005',
    card_no: '6236****2222',
    card_hash: 'e5f6g7h8i9j0k1l2',
    device_id: 'DEV-2N3M-8B5A',
    amount: 3200,
    merchant_id: 'M005',
    merchant_name: '餐饮连锁店',
    region: '广州市',
    region_code: 'CN-GZ',
    is_overseas: false,
    transaction_time: '2026-06-08T19:30:25Z',
    lat: 23.1291,
    lng: 113.2644,
  },
  {
    id: 1006,
    transaction_no: 'TX202606080006',
    card_no: '6227****3333',
    card_hash: 'f6g7h8i9j0k1l2m3',
    device_id: 'DEV-6C7D-4E8F',
    amount: 95000,
    merchant_id: 'M006',
    merchant_name: '汽车4S店',
    region: '深圳市',
    region_code: 'CN-SZ',
    is_overseas: false,
    transaction_time: '2026-06-08T15:20:10Z',
    lat: 22.5431,
    lng: 114.0579,
  },
  {
    id: 1007,
    transaction_no: 'TX202606070007',
    card_no: '6259****4444',
    card_hash: 'g7h8i9j0k1l2m3n4',
    device_id: 'DEV-9G1H-2I3J',
    amount: 180000,
    merchant_id: 'M007',
    merchant_name: '奢侈品拍卖网站',
    region: '美国',
    region_code: 'US',
    is_overseas: true,
    transaction_time: '2026-06-07T03:45:50Z',
    lat: 40.7128,
    lng: -74.0060,
  },
  {
    id: 1008,
    transaction_no: 'TX202606070008',
    card_no: '6212****5555',
    card_hash: 'h8i9j0k1l2m3n4o5',
    device_id: 'DEV-4K5L-6M7N',
    amount: 2800,
    merchant_id: 'M008',
    merchant_name: '线上书店',
    region: '杭州市',
    region_code: 'CN-HZ',
    is_overseas: false,
    transaction_time: '2026-06-07T21:12:33Z',
    lat: 30.2741,
    lng: 120.1551,
  },
  {
    id: 1009,
    transaction_no: 'TX202606060009',
    card_no: '6216****6666',
    card_hash: 'i9j0k1l2m3n4o5p6',
    device_id: 'DEV-8O9P-1Q2R',
    amount: 67000,
    merchant_id: 'M009',
    merchant_name: '家电大卖场',
    region: '成都市',
    region_code: 'CN-CD',
    is_overseas: false,
    transaction_time: '2026-06-06T14:05:40Z',
    lat: 30.5728,
    lng: 104.0668,
  },
  {
    id: 1010,
    transaction_no: 'TX202606050010',
    card_no: '6230****7777',
    card_hash: 'j0k1l2m3n4o5p6q7',
    device_id: 'DEV-3S4T-5U6V',
    amount: 12000,
    merchant_id: 'M010',
    merchant_name: '运动品牌旗舰店',
    region: '武汉市',
    region_code: 'CN-WH',
    is_overseas: false,
    transaction_time: '2026-06-05T11:50:18Z',
    lat: 30.5928,
    lng: 114.3055,
  },
  {
    id: 1011,
    transaction_no: 'TX202606040011',
    card_no: '6228****8888',
    card_hash: 'k1l2m3n4o5p6q7r8',
    device_id: 'DEV-7W8X-9Y0Z',
    amount: 45000,
    merchant_id: 'M011',
    merchant_name: '旅行社',
    region: '西安市',
    region_code: 'CN-XA',
    is_overseas: false,
    transaction_time: '2026-06-04T16:40:22Z',
    lat: 34.3416,
    lng: 108.9398,
  },
  {
    id: 1012,
    transaction_no: 'TX202606030012',
    card_no: '6258****9999',
    card_hash: 'l2m3n4o5p6q7r8s9',
    device_id: 'DEV-1A2B-3C4D',
    amount: 330000,
    merchant_id: 'M012',
    merchant_name: '海外房产中介',
    region: '英国',
    region_code: 'GB',
    is_overseas: true,
    transaction_time: '2026-06-03T05:20:55Z',
    lat: 51.5074,
    lng: -0.1278,
  },
];

const mockRuleHitsSets: CaseRuleHit[][] = [
  [
    { rule_name: '大额交易阈值规则', trigger_condition: '单笔金额 > 50000', score: 35 },
    { rule_name: '异地高风险商户规则', trigger_condition: '商户风险等级=高 AND 地域异常', score: 30 },
    { rule_name: '设备指纹异常规则', trigger_condition: '设备首次使用 AND 金额>10000', score: 25 },
  ],
  [
    { rule_name: '境外交易规则', trigger_condition: 'is_overseas = true AND 金额 > 10000', score: 40 },
    { rule_name: '短时间多笔交易规则', trigger_condition: '1小时内交易 > 3笔', score: 20 },
  ],
  [
    { rule_name: '频率异常规则', trigger_condition: '单日交易次数 > 10', score: 25 },
  ],
  [
    { rule_name: '大额境外交易规则', trigger_condition: '境外 AND 金额 > 100000', score: 50 },
    { rule_name: '设备异常规则', trigger_condition: '新设备首次大额交易', score: 30 },
    { rule_name: '跨地域短时间规则', trigger_condition: '2小时内跨2个以上城市', score: 15 },
  ],
  [
    { rule_name: '夜间小额高频规则', trigger_condition: '0:00-6:00 AND 30分钟内5笔', score: 15 },
  ],
  [
    { rule_name: '大额交易阈值规则', trigger_condition: '单笔金额 > 50000', score: 35 },
    { rule_name: '商户黑名单关联规则', trigger_condition: '商户在灰名单中', score: 20 },
  ],
  [
    { rule_name: '大额境外交易规则', trigger_condition: '境外 AND 金额 > 100000', score: 50 },
    { rule_name: '高风险国家/地区规则', trigger_condition: '交易国家在高风险列表', score: 30 },
    { rule_name: '频次异常规则', trigger_condition: '单日>5笔境外交易', score: 10 },
  ],
  [
    { rule_name: '连续小额试探规则', trigger_condition: '1小时内5笔<5000交易后一笔大额', score: 12 },
  ],
  [
    { rule_name: '大额交易阈值规则', trigger_condition: '单笔金额 > 50000', score: 35 },
    { rule_name: '新旧设备交替规则', trigger_condition: '24小时内3台以上设备', score: 18 },
  ],
  [
    { rule_name: '消费行为突变规则', trigger_condition: '金额超过近30天均值10倍', score: 22 },
  ],
  [
    { rule_name: '旅游消费集中规则', trigger_condition: '旅行社+机票+酒店短时间集中', score: 28 },
  ],
  [
    { rule_name: '大额境外交易规则', trigger_condition: '境外 AND 金额 > 100000', score: 50 },
    { rule_name: '房产类大额交易规则', trigger_condition: '商户MCC为房产类', score: 25 },
    { rule_name: '首次跨境交易规则', trigger_condition: '卡片首次跨境交易', score: 10 },
  ],
];

const generateHistoryTxns = (cardHash: string, baseTime: string): CaseHistoryTxn[] => {
  const history: CaseHistoryTxn[] = [];
  const decisions: DecisionType[] = ['allow', 'review', 'block'];
  for (let i = 0; i < 8; i++) {
    const time = dayjs(baseTime).subtract(i + 1, 'hour').toISOString();
    const score = Math.floor(Math.random() * 100);
    const isAbnormal = score >= 70;
    history.push({
      id: 2000 + i,
      transaction_no: `TX${dayjs(time).format('YYYYMMDD')}${String(100 + i).padStart(3, '0')}`,
      amount: Math.floor(Math.random() * 200000) + 500,
      transaction_time: time,
      risk_score: score,
      decision: isAbnormal ? (Math.random() > 0.5 ? 'block' : 'review') : 'allow',
      is_abnormal: isAbnormal,
    });
  }
  return history.sort((a, b) =>
    dayjs(a.transaction_time).isAfter(dayjs(b.transaction_time)) ? -1 : 1,
  );
};

const now = dayjs();

const analystNames = ['张伟', '李娜', '王芳', '刘洋', '陈静'];

const buildMockCases = (): Case[] => {
  return mockTransactions.map((txn, idx) => {
    const ruleHits = mockRuleHitsSets[idx % mockRuleHitsSets.length];
    const riskScore = ruleHits.reduce((sum, h) => sum + h.score, 0);
    const status: CaseStatus = idx < 3 ? 'pending' : idx < 7 ? 'investigating' : 'closed';
    const assignedIdx = idx < 3 ? undefined : idx % 5;
    const conclusion: CaseConclusion | undefined =
      status === 'closed'
        ? (['pass', 'fraud', 'false_positive'] as CaseConclusion[])[idx % 3]
        : undefined;
    const closedAt = status === 'closed' ? now.subtract(idx, 'hour').toISOString() : undefined;
    const createdAt = now.subtract(idx * 3 + 2, 'hour').toISOString();

    return {
      id: idx + 1,
      case_no: generateCaseNo(createdAt, idx + 1),
      status,
      risk_level: scoreToRiskLevel(riskScore),
      risk_score: riskScore,
      assigned_to: assignedIdx !== undefined ? `user_${assignedIdx + 1}` : undefined,
      assigned_to_name: assignedIdx !== undefined ? analystNames[assignedIdx] : undefined,
      assigned_at: assignedIdx !== undefined ? now.subtract(idx * 2 + 1, 'hour').toISOString() : undefined,
      conclusion,
      conclusion_note:
        status === 'closed'
          ? conclusion === 'fraud'
            ? '经核实，该卡片确实被盗刷，交易地点与持卡人日常消费习惯严重不符，设备指纹与历史设备完全不同，确认欺诈交易。'
            : conclusion === 'false_positive'
            ? '持卡人事后反馈为本人交易，因在境外旅游导致触发异地和境外交易规则，属于正常消费，为误报。'
            : '交易核实为持卡人本人正常消费，虽金额较大但符合其历史消费能力，已通过审批。'
          : undefined,
      closed_at: closedAt,
      created_at: createdAt,
      updated_at: closedAt || createdAt,
      transaction_id: txn.id,
      transaction: txn,
      rule_hits: ruleHits,
      notes:
        idx >= 3
          ? [
              {
                id: 1,
                content: '已初步核实交易基本信息，正在联系持卡人确认。',
                operator: analystNames[assignedIdx || 0],
                created_at: now.subtract(idx * 2, 'hour').toISOString(),
              },
              ...(idx >= 5
                ? [
                    {
                      id: 2,
                      content: '持卡人电话未接通，已发送短信和邮件通知，请其尽快回复确认。',
                      operator: analystNames[assignedIdx || 0],
                      created_at: now.subtract(idx, 'hour').toISOString(),
                    },
                  ]
                : []),
            ]
          : [],
      history_transactions: generateHistoryTxns(txn.card_hash, txn.transaction_time),
    };
  });
};

export interface CaseStoreState {
  cases: Case[];
  getCaseList: (
    filter: CaseListFilter & { page: number; page_size: number },
  ) => Promise<PaginatedResponse<Case>>;
  getCase: (id: number) => Case | undefined;
  assignCase: (caseId: number, userId: string, userName: string) => Promise<Case | undefined>;
  closeCase: (
    caseId: number,
    conclusion: CaseConclusion,
    conclusionNote: string,
  ) => Promise<Case | undefined>;
  addNote: (caseId: number, content: string, operator: string) => Promise<Case | undefined>;
  getStats: () => Promise<CaseStats>;
}

export const useCaseStore = create<CaseStoreState>((set, get) => ({
  cases: buildMockCases(),

  getCaseList: async (filter) => {
    try {
      const res = await apiGetCases(filter);
      if (res.code === 0 && res.data) {
        return res.data;
      }
    } catch {
      // fallback to local mock
    }

    const { cases } = get();
    let filtered = [...cases];

    if (filter.status) {
      filtered = filtered.filter((c) => c.status === filter.status);
    }
    if (filter.risk_level) {
      filtered = filtered.filter((c) => c.risk_level === filter.risk_level);
    }
    if (filter.assigned_to) {
      filtered = filtered.filter((c) => c.assigned_to === filter.assigned_to);
    }
    if (filter.start_time) {
      filtered = filtered.filter((c) => dayjs(c.created_at).isAfter(dayjs(filter.start_time)));
    }
    if (filter.end_time) {
      filtered = filtered.filter((c) => dayjs(c.created_at).isBefore(dayjs(filter.end_time)));
    }

    filtered.sort((a, b) => (dayjs(a.created_at).isAfter(dayjs(b.created_at)) ? -1 : 1));

    const total = filtered.length;
    const start = (filter.page - 1) * filter.page_size;
    const items = filtered.slice(start, start + filter.page_size);

    return {
      items,
      total,
      page: filter.page,
      page_size: filter.page_size,
      total_pages: Math.ceil(total / filter.page_size),
    };
  },

  getCase: (id) => {
    return get().cases.find((c) => c.id === id);
  },

  assignCase: async (caseId, userId, userName) => {
    try {
      const res = await apiAssignCase(caseId);
      if (res.code === 0 && res.data) {
        set((state) => ({
          cases: state.cases.map((c) => (c.id === caseId ? res.data! : c)),
        }));
        return res.data;
      }
    } catch {
      // fallback to local mock
    }

    let assigned: Case | undefined;
    set((state) => {
      const newCases = state.cases.map((c) => {
        if (c.id === caseId && c.status === 'pending') {
          assigned = {
            ...c,
            status: 'investigating',
            assigned_to: userId,
            assigned_to_name: userName,
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return assigned;
        }
        return c;
      });
      return { cases: newCases };
    });
    return assigned;
  },

  closeCase: async (caseId, conclusion, conclusionNote) => {
    try {
      const res = await apiCloseCase(caseId, { conclusion, conclusion_note: conclusionNote });
      if (res.code === 0 && res.data) {
        set((state) => ({
          cases: state.cases.map((c) => (c.id === caseId ? res.data! : c)),
        }));
        return res.data;
      }
    } catch {
      // fallback to local mock
    }

    let closed: Case | undefined;
    set((state) => {
      const newCases = state.cases.map((c) => {
        if (c.id === caseId && c.status === 'investigating') {
          closed = {
            ...c,
            status: 'closed',
            conclusion,
            conclusion_note: conclusionNote,
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return closed;
        }
        return c;
      });
      return { cases: newCases };
    });
    return closed;
  },

  addNote: async (caseId, content, operator) => {
    try {
      const res = await apiAddCaseNote(caseId, { content });
      if (res.code === 0 && res.data) {
        set((state) => ({
          cases: state.cases.map((c) => (c.id === caseId ? res.data! : c)),
        }));
        return res.data;
      }
    } catch {
      // fallback to local mock
    }

    let updated: Case | undefined;
    set((state) => {
      const newCases = state.cases.map((c) => {
        if (c.id === caseId && c.status !== 'closed') {
          const newNote: CaseNote = {
            id: (c.notes?.length || 0) + 1,
            content,
            operator,
            created_at: new Date().toISOString(),
          };
          updated = {
            ...c,
            notes: [...(c.notes || []), newNote],
            updated_at: new Date().toISOString(),
          };
          return updated;
        }
        return c;
      });
      return { cases: newCases };
    });
    return updated;
  },

  getStats: async () => {
    try {
      const res = await apiGetCaseStats();
      if (res.code === 0 && res.data) {
        return res.data;
      }
    } catch {
      // fallback to local mock
    }

    const { cases } = get();
    const pendingCount = cases.filter((c) => c.status === 'pending').length;
    const investigatingCount = cases.filter((c) => c.status === 'investigating').length;
    const today = dayjs().startOf('day');
    const todayClosed = cases.filter(
      (c) => c.status === 'closed' && c.closed_at && dayjs(c.closed_at).isAfter(today),
    ).length;

    const closedCases = cases.filter((c) => c.status === 'closed' && c.closed_at);
    const totalHours = closedCases.reduce((sum, c) => {
      const hours = dayjs(c.closed_at!).diff(dayjs(c.created_at), 'hour', true);
      return sum + hours;
    }, 0);
    const avgHours = closedCases.length > 0 ? Number((totalHours / closedCases.length).toFixed(1)) : 0;

    return {
      pending_count: pendingCount,
      investigating_count: investigatingCount,
      today_closed_count: todayClosed,
      avg_processing_hours: avgHours,
    };
  },
}));
