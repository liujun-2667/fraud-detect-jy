import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  DatePicker,
  message,
  Input,
  Tooltip,
} from 'antd';
import type { TableProps } from 'antd';
import {
  SearchOutlined,
  UserOutlined,
  EyeOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useCaseStore, requestNotificationPermission } from '../../store/useCaseStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Case,
  CaseStatus,
  CaseRiskLevel,
  PaginatedResponse,
} from '../../types';

const { Option } = Select;
const { RangePicker } = DatePicker;

const CasesList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { getCaseList, autoAssignCase } = useCaseStore();

  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [statusFilter, setStatusFilter] = useState<CaseStatus | undefined>();
  const [riskLevelFilter, setRiskLevelFilter] = useState<CaseRiskLevel | undefined>();
  const [assignedToFilter, setAssignedToFilter] = useState<string | undefined>();
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [caseNoSearch, setCaseNoSearch] = useState('');

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const loadCases = async () => {
    setLoading(true);
    try {
      const result: PaginatedResponse<Case> = await getCaseList({
        page,
        page_size: pageSize,
        status: statusFilter,
        risk_level: riskLevelFilter,
        assigned_to: assignedToFilter,
        start_time: timeRange?.[0]?.toISOString(),
        end_time: timeRange?.[1]?.toISOString(),
      });
      let items = result.items;
      if (caseNoSearch) {
        items = items.filter((c) =>
          c.case_no.toLowerCase().includes(caseNoSearch.toLowerCase()),
        );
      }
      setCases(items);
      setTotal(caseNoSearch ? items.length : result.total);
    } catch (e: any) {
      message.error(e.message || '获取案件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [page, pageSize]);

  const handleSearch = () => {
    setPage(1);
    loadCases();
  };

  const handleReset = () => {
    setStatusFilter(undefined);
    setRiskLevelFilter(undefined);
    setAssignedToFilter(undefined);
    setTimeRange(null);
    setCaseNoSearch('');
    setPage(1);
    setTimeout(loadCases, 0);
  };

  const handleAutoAssign = async (record: Case) => {
    const result = await autoAssignCase(record.id);
    if (result) {
      message.success(`案件已自动分配给 ${result.assigned_to_name}`);
      loadCases();
    } else {
      message.error('案件分配失败');
    }
  };

  const getStatusColor = (status: CaseStatus): string => {
    const map: Record<CaseStatus, string> = {
      pending: 'gold',
      investigating: 'blue',
      closed: 'default',
    };
    return map[status];
  };

  const getStatusText = (status: CaseStatus): string => {
    const map: Record<CaseStatus, string> = {
      pending: '待分配',
      investigating: '调查中',
      closed: '已结案',
    };
    return map[status];
  };

  const getRiskLevelColor = (level: CaseRiskLevel): string => {
    const map: Record<CaseRiskLevel, string> = {
      high: 'red',
      medium: 'orange',
      low: 'green',
    };
    return map[level];
  };

  const getRiskLevelText = (level: CaseRiskLevel): string => {
    const map: Record<CaseRiskLevel, string> = {
      high: '高风险',
      medium: '中风险',
      low: '低风险',
    };
    return map[level];
  };

  const columns: TableProps<Case>['columns'] = [
    {
      title: '案件编号',
      dataIndex: 'case_no',
      key: 'case_no',
      width: 200,
      render: (val: string, record: Case) => (
        <a onClick={() => navigate(`/cases/${record.id}`)}>{val}</a>
      ),
    },
    {
      title: '关联交易金额',
      dataIndex: ['transaction', 'amount'],
      key: 'amount',
      width: 140,
      render: (val: number) =>
        val > 50000 ? (
          <span style={{ color: '#ff4d4f', fontWeight: 600 }}>¥{val.toLocaleString()}</span>
        ) : (
          `¥${val.toLocaleString()}`
        ),
    },
    {
      title: '风险等级',
      dataIndex: 'risk_level',
      key: 'risk_level',
      width: 120,
      render: (val: CaseRiskLevel) => (
        <Tag color={getRiskLevelColor(val)} style={{ fontWeight: 600 }}>
          {getRiskLevelText(val)}
        </Tag>
      ),
    },
    {
      title: '风险评分',
      dataIndex: 'risk_score',
      key: 'risk_score',
      width: 100,
      render: (val: number) => {
        const color = val >= 71 ? '#ff4d4f' : val >= 41 ? '#faad14' : '#52c41a';
        return <span style={{ color, fontWeight: 600 }}>{val}</span>;
      },
    },
    {
      title: '当前状态',
      dataIndex: 'status',
      key: 'status',
      width: 200,
      render: (val: CaseStatus, record: Case) => (
        <Space>
          <Tag color={getStatusColor(val)}>{getStatusText(val)}</Tag>
          {record.is_overtime && (
            <Tag
              color="red"
              icon={<WarningOutlined />}
              style={{
                animation: 'blink 1s infinite',
                fontWeight: 600,
              }}
            >
              超时
            </Tag>
          )}
          {val === 'pending' && record.assigned_to_name && (
            <Tag color="blue">已自动分配</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '认领人',
      dataIndex: 'assigned_to_name',
      key: 'assigned_to_name',
      width: 120,
      render: (val?: string) =>
        val ? (
          <Space>
            <UserOutlined />
            <span>{val}</span>
          </Space>
        ) : (
          <span style={{ color: '#999' }}>未分配</span>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: unknown, record: Case) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/cases/${record.id}`)}
            >
              详情
            </Button>
          </Tooltip>
          {record.status === 'pending' && (
            <Tooltip title="系统自动分配">
              <Button type="primary" size="small" onClick={() => handleAutoAssign(record)}>
                自动分配
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}
      </style>
      <Card
        title="案件调查工作台"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadCases}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="案件编号"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            allowClear
            value={caseNoSearch}
            onChange={(e) => setCaseNoSearch(e.target.value)}
          />
          <Select
            placeholder="案件状态"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
          >
            <Option value="pending">待分配</Option>
            <Option value="investigating">调查中</Option>
            <Option value="closed">已结案</Option>
          </Select>
          <Select
            placeholder="风险等级"
            allowClear
            style={{ width: 140 }}
            value={riskLevelFilter}
            onChange={(v) => setRiskLevelFilter(v)}
          >
            <Option value="high">高风险</Option>
            <Option value="medium">中风险</Option>
            <Option value="low">低风险</Option>
          </Select>
          <Select
            placeholder="认领人"
            allowClear
            style={{ width: 140 }}
            value={assignedToFilter}
            onChange={(v) => setAssignedToFilter(v)}
          >
            <Option value="user_1">张伟</Option>
            <Option value="user_2">李娜</Option>
            <Option value="user_3">王芳</Option>
            <Option value="user_4">刘洋</Option>
            <Option value="user_5">陈静</Option>
          </Select>
          <RangePicker
            showTime
            value={timeRange}
            onChange={(v) => setTimeRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            查询
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>

        <Table
          loading={loading}
          dataSource={cases}
          columns={columns}
          rowKey="id"
          scroll={{ x: 1400 }}
          rowClassName={(record) => (record.is_overtime ? 'overtime-row' : '')}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
      <style>
        {`
          .overtime-row > td {
            background-color: #fff1f0 !important;
          }
          .overtime-row:hover > td {
            background-color: #ffccc7 !important;
          }
        `}
      </style>
    </>
  );
};

export default CasesList;
