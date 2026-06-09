import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  Drawer,
  Descriptions,
  List,
  Typography,
  Divider,
  message,
  Form,
  Tabs,
} from 'antd';
import {
  SearchOutlined,
  ExportOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getTransactions,
  getTransactionById,
  getTransactionEvaluations,
  getTransactionsByCard,
  exportTransactionsCsv,
} from '../../api/transactions';
import { Transaction, Evaluation, DecisionType } from '../../types';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const Transactions: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [transactionNo, setTransactionNo] = useState('');
  const [cardHash, setCardHash] = useState('');
  const [decision, setDecision] = useState<DecisionType | undefined>();
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const [cardForm] = Form.useForm();
  const [cardQueryLoading, setCardQueryLoading] = useState(false);
  const [cardTransactions, setCardTransactions] = useState<Transaction[]>([]);
  const [cardTotal, setCardTotal] = useState(0);
  const [cardPage, setCardPage] = useState(1);
  const [cardPageSize, setCardPageSize] = useState(20);
  const [searchedCard, setSearchedCard] = useState('');

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: pageSize };
      if (transactionNo) params.transaction_no = transactionNo;
      if (cardHash) params.card_hash = cardHash;
      if (decision) params.decision = decision;
      if (timeRange && timeRange[0] && timeRange[1]) {
        params.start_time = timeRange[0].toISOString();
        params.end_time = timeRange[1].toISOString();
      }
      const res = await getTransactions(params);
      if (res.code === 0) {
        setTransactions(res.data?.items || []);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '获取交易列表失败');
      }
    } catch (e: any) {
      message.error(e.message || '获取交易列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCardTransactions = async () => {
    try {
      const values = await cardForm.validateFields();
      setCardQueryLoading(true);
      setSearchedCard(values.card_hash);
      const res = await getTransactionsByCard(values.card_hash, { page: cardPage, page_size: cardPageSize });
      if (res.code === 0) {
        setCardTransactions(res.data?.items || []);
        setCardTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '获取卡交易历史失败');
      }
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e.message || '获取卡交易历史失败');
      }
    } finally {
      setCardQueryLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
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

  const handleExport = () => {
    if (timeRange && timeRange[0] && timeRange[1]) {
      exportTransactionsCsv(timeRange[0].toISOString(), timeRange[1].toISOString());
    } else {
      const end = dayjs();
      const start = end.subtract(7, 'day');
      exportTransactionsCsv(start.toISOString(), end.toISOString());
    }
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
    },
    {
      title: '卡号',
      dataIndex: 'card_no',
      key: 'card_no',
      width: 160,
      render: (val: string) => val || '-',
    },
    {
      title: '卡号哈希',
      dataIndex: 'card_hash',
      key: 'card_hash',
      width: 200,
      ellipsis: true,
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
      sorter: (a: Transaction, b: Transaction) => a.amount - b.amount,
    },
    {
      title: '商户',
      dataIndex: 'merchant_name',
      key: 'merchant_name',
      width: 160,
      render: (val?: string) => val || '-',
    },
    {
      title: '地域',
      dataIndex: 'region',
      key: 'region',
      width: 100,
      render: (val: string | undefined, record: Transaction) => (
        <Space>
          <span>{val || '-'}</span>
          {record.is_overseas && <Tag color="red">境外</Tag>}
        </Space>
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
      title: '交易时间',
      dataIndex: 'transaction_time',
      key: 'transaction_time',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  const tabItems = [
    {
      key: 'list',
      label: '交易列表',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space style={{ marginBottom: 16 }} wrap>
            <Input
              placeholder="交易号"
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              allowClear
              value={transactionNo}
              onChange={(e) => setTransactionNo(e.target.value)}
            />
            <Input
              placeholder="卡号哈希"
              prefix={<CreditCardOutlined />}
              style={{ width: 240 }}
              allowClear
              value={cardHash}
              onChange={(e) => setCardHash(e.target.value)}
            />
            <Select
              placeholder="决策类型"
              allowClear
              style={{ width: 140 }}
              value={decision}
              onChange={(v) => setDecision(v)}
            >
              <Option value="allow">通过</Option>
              <Option value="review">待审核</Option>
              <Option value="block">拦截</Option>
            </Select>
            <RangePicker
              showTime
              value={timeRange}
              onChange={(v) => setTimeRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={loadTransactions}>
              查询
            </Button>
          </Space>

          <Table
            loading={loading}
            dataSource={transactions}
            columns={columns}
            rowKey="id"
            onRow={(record) => ({
              onClick: () => handleOpenDrawer(record),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </Space>
      ),
    },
    {
      key: 'card',
      label: '按卡号查询',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Form form={cardForm} layout="inline">
            <Form.Item
              label="卡号哈希"
              name="card_hash"
              rules={[{ required: true, message: '请输入卡号哈希' }]}
            >
              <Input placeholder="请输入卡号哈希" style={{ width: 360 }} allowClear />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={loadCardTransactions}
                loading={cardQueryLoading}
              >
                查询
              </Button>
            </Form.Item>
          </Form>

          {searchedCard && (
            <Text type="secondary">查询结果：卡号哈希 {searchedCard}</Text>
          )}

          <Table
            loading={cardQueryLoading}
            dataSource={cardTransactions}
            columns={columns}
            rowKey="id"
            onRow={(record) => ({
              onClick: () => handleOpenDrawer(record),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: cardPage,
              pageSize: cardPageSize,
              total: cardTotal,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setCardPage(p);
                setCardPageSize(ps);
                loadCardTransactions();
              },
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="交易查询"
      extra={
        <Button icon={<ExportOutlined />} onClick={handleExport}>
          导出CSV
        </Button>
      }
    >
      <Tabs items={tabItems} />

      <Drawer
        title="交易详情"
        width={800}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {currentTransaction && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small" title="基本信息">
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
              <Descriptions.Item label="设备ID">
                {currentTransaction.device_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="交易时间">
                {dayjs(currentTransaction.transaction_time).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            {currentTransaction.evaluation && (
              <Descriptions column={2} bordered size="small" title="最新评估">
                <Descriptions.Item label="风险评分">
                  {currentTransaction.evaluation.risk_score}
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
                  评分明细
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

export default Transactions;
