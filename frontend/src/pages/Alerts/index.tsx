import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  DatePicker,
  InputNumber,
  Drawer,
  Descriptions,
  List,
  Typography,
  Divider,
  message,
  Modal,
} from 'antd';
import {
  CheckCircleOutlined,
  StopOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getTransactions,
  getTransactionById,
  getTransactionEvaluations,
} from '../../api/transactions';
import { Transaction, Evaluation, DecisionType } from '../../types';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

interface AlertItem extends Transaction {
  key?: React.Key;
}

const Alerts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [decision, setDecision] = useState<DecisionType | undefined>();
  const [minScore, setMinScore] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: pageSize };
      if (decision) {
        params.decision = decision;
      } else {
        params.decisions = 'review,block';
      }
      if (minScore > 0) params.min_score = minScore;
      if (timeRange && timeRange[0] && timeRange[1]) {
        params.start_time = timeRange[0].toISOString();
        params.end_time = timeRange[1].toISOString();
      }
      const res = await getTransactions(params);
      if (res.code === 0) {
        const items = (res.data?.items || []).filter(
          (t: Transaction) =>
            t.evaluation?.decision === 'review' || t.evaluation?.decision === 'block',
        );
        setAlerts(items);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '获取告警列表失败');
      }
    } catch (e: any) {
      message.error(e.message || '获取告警列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [page, pageSize]);

  const handleOpenDrawer = async (record: Transaction) => {
    setCurrentTransaction(record);
    setDrawerOpen(true);
    try {
      const [txnRes, evalRes] = await Promise.all([
        getTransactionById(record.id),
        getTransactionEvaluations(record.id),
      ]);
      if (txnRes.code === 0) setCurrentTransaction(txnRes.data);
      if (evalRes.code === 0) setEvaluations(evalRes.data || []);
    } catch (e: any) {
      message.error(e.message || '获取交易详情失败');
    }
  };

  const handleApprove = (record: Transaction) => {
    Modal.confirm({
      title: '人工审核通过',
      content: `确定将交易「${record.transaction_no}」标记为通过吗？该交易将被放行。`,
      okText: '确认通过',
      onOk: () => {
        message.success(`交易 ${record.transaction_no} 已通过审核`);
        setSelectedRowKeys(selectedRowKeys.filter((k) => k !== record.id));
        loadAlerts();
      },
    });
  };

  const handleBlock = (record: Transaction) => {
    Modal.confirm({
      title: '人工审核拦截',
      content: `确定将交易「${record.transaction_no}」标记为拦截吗？该交易将被阻止。`,
      okText: '确认拦截',
      okButtonProps: { danger: true },
      onOk: () => {
        message.success(`交易 ${record.transaction_no} 已拦截`);
        setSelectedRowKeys(selectedRowKeys.filter((k) => k !== record.id));
        loadAlerts();
      },
    });
  };

  const handleBatchApprove = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要审核的交易');
      return;
    }
    Modal.confirm({
      title: '批量审核通过',
      content: `确定将选中的 ${selectedRowKeys.length} 条交易标记为通过吗？`,
      okText: '确认通过',
      onOk: () => {
        message.success(`已批量通过 ${selectedRowKeys.length} 条交易`);
        setSelectedRowKeys([]);
        loadAlerts();
      },
    });
  };

  const handleBatchBlock = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要审核的交易');
      return;
    }
    Modal.confirm({
      title: '批量审核拦截',
      content: `确定将选中的 ${selectedRowKeys.length} 条交易标记为拦截吗？`,
      okText: '确认拦截',
      okButtonProps: { danger: true },
      onOk: () => {
        message.success(`已批量拦截 ${selectedRowKeys.length} 条交易`);
        setSelectedRowKeys([]);
        loadAlerts();
      },
    });
  };

  const getDecisionColor = (val?: DecisionType) => {
    const map: Record<DecisionType, string> = {
      block: 'red',
      review: 'orange',
      allow: 'green',
    };
    return val ? map[val] : 'default';
  };

  const getDecisionText = (val?: DecisionType) => {
    const map: Record<DecisionType, string> = {
      block: '拦截',
      review: '待审核',
      allow: '通过',
    };
    return val ? map[val] : '-';
  };

  const columns = [
    {
      title: '交易号',
      dataIndex: 'transaction_no',
      key: 'transaction_no',
      width: 200,
      render: (text: string, record: Transaction) => (
        <a onClick={() => handleOpenDrawer(record)}>{text}</a>
      ),
    },
    {
      title: '卡号',
      dataIndex: 'card_no',
      key: 'card_no',
      width: 160,
      render: (val: string) => val || '-',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (val: number) =>
        val > 10000 ? (
          <span style={{ color: '#ff4d4f', fontWeight: 600 }}>¥{val.toLocaleString()}</span>
        ) : (
          `¥${val.toLocaleString()}`
        ),
    },
    {
      title: '风险评分',
      dataIndex: ['evaluation', 'risk_score'],
      key: 'risk_score',
      width: 100,
      render: (val?: number) => {
        if (val === undefined) return '-';
        const color = val >= 80 ? '#ff4d4f' : val >= 50 ? '#faad14' : '#52c41a';
        return <span style={{ color, fontWeight: 600 }}>{val}</span>;
      },
      sorter: (a: Transaction, b: Transaction) =>
        (a.evaluation?.risk_score || 0) - (b.evaluation?.risk_score || 0),
    },
    {
      title: '决策',
      dataIndex: ['evaluation', 'decision'],
      key: 'decision',
      width: 100,
      render: (val?: DecisionType) => (
        <Tag color={getDecisionColor(val)}>{getDecisionText(val)}</Tag>
      ),
    },
    {
      title: '命中规则数',
      key: 'hit_count',
      width: 110,
      render: (_: any, record: Transaction) => {
        const count = record.evaluation?.rule_hits?.filter((h) => h.is_hit).length || 0;
        return count > 0 ? <Tag color="red">{count} 条</Tag> : '0 条';
      },
    },
    {
      title: '评估时间',
      dataIndex: ['evaluation', 'created_at'],
      key: 'created_at',
      width: 170,
      render: (val?: string) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: Transaction) => (
        <Space>
          <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(record)}>
            通过
          </Button>
          <Button size="small" danger icon={<StopOutlined />} onClick={() => handleBlock(record)}>
            拦截
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title="告警中心">
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="决策类型"
          allowClear
          style={{ width: 140 }}
          value={decision}
          onChange={(v) => setDecision(v)}
        >
          <Option value="review">待审核</Option>
          <Option value="block">已拦截</Option>
        </Select>
        <Space>
          <Text>最小评分:</Text>
          <InputNumber
            min={0}
            max={100}
            value={minScore}
            onChange={(v) => setMinScore(v ?? 0)}
          />
        </Space>
        <RangePicker
          showTime
          value={timeRange}
          onChange={(v) => setTimeRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={loadAlerts}>
          查询
        </Button>
      </Space>

      {selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          <Tag color="blue">已选择 {selectedRowKeys.length} 项</Tag>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleBatchApprove}>
            批量通过
          </Button>
          <Button danger icon={<StopOutlined />} onClick={handleBatchBlock}>
            批量拦截
          </Button>
        </Space>
      )}

      <Table
        loading={loading}
        dataSource={alerts}
        columns={columns}
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条告警`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <Drawer
        title="告警详情"
        width={800}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {currentTransaction && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small" title="交易基本信息">
              <Descriptions.Item label="交易号" span={2}>
                {currentTransaction.transaction_no}
              </Descriptions.Item>
              <Descriptions.Item label="卡号">
                {currentTransaction.card_no}
              </Descriptions.Item>
              <Descriptions.Item label="卡号哈希">
                <Text copyable>{currentTransaction.card_hash}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                {currentTransaction.amount > 10000 ? (
                  <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
                    ¥{currentTransaction.amount.toLocaleString()}
                  </span>
                ) : (
                  `¥${currentTransaction.amount.toLocaleString()}`
                )}
              </Descriptions.Item>
              <Descriptions.Item label="商户">
                {currentTransaction.merchant_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="地域">
                {currentTransaction.region || '-'}
                {currentTransaction.is_overseas && <Tag color="red">境外</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="交易时间">
                {dayjs(currentTransaction.transaction_time).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            {currentTransaction.evaluation && (
              <Descriptions column={2} bordered size="small" title="风控评估">
                <Descriptions.Item label="风险评分">
                  <Text
                    strong
                    style={{
                      color:
                        currentTransaction.evaluation.risk_score >= 80
                          ? '#ff4d4f'
                          : currentTransaction.evaluation.risk_score >= 50
                            ? '#faad14'
                            : '#52c41a',
                    }}
                  >
                    {currentTransaction.evaluation.risk_score}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="决策">
                  <Tag color={getDecisionColor(currentTransaction.evaluation.decision)}>
                    {getDecisionText(currentTransaction.evaluation.decision)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="执行耗时">
                  {currentTransaction.evaluation.execution_ms} ms
                </Descriptions.Item>
                <Descriptions.Item label="评估时间">
                  {dayjs(currentTransaction.evaluation.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
              </Descriptions>
            )}

            {currentTransaction.evaluation?.rule_hits && (
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  命中规则明细
                </Title>
                <Table
                  size="small"
                  dataSource={currentTransaction.evaluation.rule_hits}
                  rowKey="rule_version_id"
                  pagination={false}
                  columns={[
                    {
                      title: '规则',
                      dataIndex: 'rule_name',
                      key: 'rule_name',
                    },
                    {
                      title: '是否命中',
                      dataIndex: 'is_hit',
                      key: 'is_hit',
                      render: (v: boolean) => (
                        <Tag color={v ? 'red' : 'default'}>{v ? '命中' : '未命中'}</Tag>
                      ),
                    },
                    {
                      title: '权重',
                      dataIndex: 'weight',
                      key: 'weight',
                      width: 80,
                    },
                    {
                      title: '得分',
                      dataIndex: 'score',
                      key: 'score',
                      width: 80,
                    },
                  ]}
                />
              </div>
            )}

            <Divider orientation="left">评估历史</Divider>
            <List
              size="small"
              dataSource={evaluations}
              renderItem={(evalItem) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color={getDecisionColor(evalItem.decision)}>
                          {getDecisionText(evalItem.decision)}
                        </Tag>
                        <Text>评分: {evalItem.risk_score}</Text>
                        <Text type="secondary">耗时: {evalItem.execution_ms}ms</Text>
                      </Space>
                    }
                    description={
                      <Space direction="vertical">
                        <Text type="secondary">
                          {dayjs(evalItem.created_at).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                        {evalItem.rule_hits && evalItem.rule_hits.length > 0 && (
                          <Space wrap>
                            {evalItem.rule_hits.map((h) => (
                              <Tag key={h.rule_version_id} color={h.is_hit ? 'red' : 'default'}>
                                {h.rule_name}: {h.score}
                              </Tag>
                            ))}
                          </Space>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Space>
        )}
      </Drawer>
    </Card>
  );
};

export default Alerts;
