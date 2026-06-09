import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Form,
  Select,
  InputNumber,
  Slider,
  Button,
  Space,
  Table,
  Tag,
  Statistic,
  List,
  Typography,
  Divider,
  message,
  Spin,
  Progress,
} from 'antd';
import {
  PlayCircleOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { createSandboxTest, getSandboxTest, getSandboxTests } from '../../api/sandbox';
import { SandboxTest, RuleType, ThresholdRuleConfig } from '../../types';

const { Option } = Select;
const { Text, Title } = Typography;

interface AssociationCondition {
  field: string;
  operator: string;
  value: any;
}

const Sandbox: React.FC = () => {
  const [form] = Form.useForm();
  const [ruleType, setRuleType] = useState<RuleType>('threshold');
  const [thresholdConfig, setThresholdConfig] = useState<ThresholdRuleConfig>({
    field: 'amount',
    operator: '>',
    value: 10000,
  });
  const [associationConditions, setAssociationConditions] = useState<AssociationCondition[]>([
    { field: 'amount', operator: '>', value: 5000 },
  ]);
  const [minMatchCount, setMinMatchCount] = useState<number>(2);
  const [behaviorConfig, setBehaviorConfig] = useState<any>({
    behavior_type: 'frequency',
    window_minutes: 60,
    threshold: 10,
    params: {},
  });
  const [weight, setWeight] = useState<number>(5);
  const [priority, setPriority] = useState<number>(5);
  const [replayDays, setReplayDays] = useState<number>(7);

  const [creating, setCreating] = useState(false);
  const [tests, setTests] = useState<SandboxTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [selectedTest, setSelectedTest] = useState<SandboxTest | null>(null);
  const [selectedTestLoading, setSelectedTestLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const loadTests = async () => {
    setTestsLoading(true);
    try {
      const res = await getSandboxTests();
      if (res.code === 0) {
        setTests(res.data || []);
      }
    } catch (e: any) {
      message.error(e.message || '获取测试列表失败');
    } finally {
      setTestsLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  useEffect(() => {
    if (!polling || !selectedTest) return;
    if (selectedTest.status !== 'running') {
      setPolling(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await getSandboxTest(selectedTest.id);
        if (res.code === 0) {
          setSelectedTest(res.data);
          if (res.data.status !== 'running') {
            setPolling(false);
            loadTests();
          }
        }
      } catch {
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [polling, selectedTest]);

  const handleCreateTest = async () => {
    setCreating(true);
    try {
      let config: any = {};
      if (ruleType === 'threshold') {
        config.threshold = thresholdConfig;
      } else if (ruleType === 'association') {
        config.association = { conditions: associationConditions, min_match_count: minMatchCount };
      } else if (ruleType === 'behavior') {
        config.behavior = behaviorConfig;
      }

      const res = await createSandboxTest({
        rule_type: ruleType,
        config,
        weight,
        priority,
        replay_days: replayDays,
      });

      if (res.code === 0) {
        message.success('沙盒测试已启动');
        setSelectedTest(res.data);
        setPolling(true);
        loadTests();
      } else {
        message.error(res.message || '创建测试失败');
      }
    } catch (e: any) {
      message.error(e.message || '创建测试失败');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectTest = async (test: SandboxTest) => {
    setSelectedTest(test);
    if (test.status === 'running') {
      setPolling(true);
      setSelectedTestLoading(true);
      try {
        const res = await getSandboxTest(test.id);
        if (res.code === 0) {
          setSelectedTest(res.data);
        }
      } finally {
        setSelectedTestLoading(false);
      }
    }
  };

  const addAssociationCondition = () => {
    setAssociationConditions([
      ...associationConditions,
      { field: 'amount', operator: '>', value: 0 },
    ]);
  };

  const updateAssociationCondition = (index: number, key: keyof AssociationCondition, value: any) => {
    const newConditions = [...associationConditions];
    newConditions[index] = { ...newConditions[index], [key]: value };
    setAssociationConditions(newConditions);
  };

  const removeAssociationCondition = (index: number) => {
    if (associationConditions.length > 1) {
      setAssociationConditions(associationConditions.filter((_, i) => i !== index));
    }
  };

  const getStatusColor = (status: SandboxTest['status']) => {
    const map: Record<SandboxTest['status'], string> = {
      running: 'blue',
      completed: 'green',
      failed: 'red',
    };
    return map[status];
  };

  const getStatusText = (status: SandboxTest['status']) => {
    const map: Record<SandboxTest['status'], string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
    };
    return map[status];
  };

  const testColumns = [
    {
      title: '测试ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string, record: SandboxTest) => (
        <a onClick={() => handleSelectTest(record)}>{id.substring(0, 8)}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: SandboxTest['status']) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
    },
    {
      title: '回放交易数',
      dataIndex: 'total_transactions',
      key: 'total_transactions',
      width: 110,
      render: (v?: number) => v ?? '-',
    },
    {
      title: '命中率',
      dataIndex: 'estimated_hit_rate',
      key: 'estimated_hit_rate',
      width: 100,
      render: (v?: number) => (v !== undefined ? `${(v * 100).toFixed(2)}%` : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  return (
    <Row gutter={16} style={{ width: '100%' }}>
      <Col span={10}>
        <Card
          title="沙盒测试配置"
          extra={
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleCreateTest}
              loading={creating}
            >
              开始测试
            </Button>
          }
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="规则类型"
              required
              initialValue="threshold"
            >
              <Select
                value={ruleType}
                onChange={(v) => setRuleType(v)}
              >
                <Option value="threshold">阈值规则</Option>
                <Option value="association">关联规则</Option>
                <Option value="behavior">行为规则</Option>
              </Select>
            </Form.Item>

            {ruleType === 'threshold' && (
              <div>
                <Divider orientation="left" style={{ margin: '8px 0' }} plain>
                  阈值配置
                </Divider>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item label="字段" required>
                      <Select
                        value={thresholdConfig.field}
                        onChange={(v) => setThresholdConfig({ ...thresholdConfig, field: v })}
                      >
                        <Option value="amount">交易金额</Option>
                        <Option value="daily_total">日累计金额</Option>
                        <Option value="frequency">交易频次</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="操作符" required>
                      <Select
                        value={thresholdConfig.operator}
                        onChange={(v) => setThresholdConfig({ ...thresholdConfig, operator: v })}
                      >
                        <Option value=">">{'>'}</Option>
                        <Option value=">=">{'>='}</Option>
                        <Option value="<">{'<'}</Option>
                        <Option value="<=">{'<='}</Option>
                        <Option value="==">{'=='}</Option>
                        <Option value="!=">{'!='}</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="阈值" required>
                      <InputNumber
                        style={{ width: '100%' }}
                        value={thresholdConfig.value}
                        onChange={(v) => setThresholdConfig({ ...thresholdConfig, value: v ?? 0 })}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            )}

            {ruleType === 'association' && (
              <div>
                <Divider orientation="left" style={{ margin: '8px 0' }} plain>
                  关联规则配置
                </Divider>
                <Form.Item label="最少匹配条件数">
                  <InputNumber
                    min={1}
                    max={associationConditions.length}
                    value={minMatchCount}
                    onChange={(v) => setMinMatchCount(v ?? 1)}
                  />
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    个条件时触发
                  </Text>
                </Form.Item>
                {associationConditions.map((cond, idx) => (
                  <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
                    <Col span={2} style={{ textAlign: 'center' }}>
                      <Tag>{idx + 1}</Tag>
                    </Col>
                    <Col span={8}>
                      <Select
                        value={cond.field}
                        style={{ width: '100%' }}
                        onChange={(v) => updateAssociationCondition(idx, 'field', v)}
                      >
                        <Option value="amount">交易金额</Option>
                        <Option value="daily_total">日累计金额</Option>
                        <Option value="frequency">交易频次</Option>
                        <Option value="region">地域</Option>
                        <Option value="is_overseas">是否境外</Option>
                      </Select>
                    </Col>
                    <Col span={6}>
                      <Select
                        value={cond.operator}
                        style={{ width: '100%' }}
                        onChange={(v) => updateAssociationCondition(idx, 'operator', v)}
                      >
                        <Option value=">">{'>'}</Option>
                        <Option value=">=">{'>='}</Option>
                        <Option value="<">{'<'}</Option>
                        <Option value="<=">{'<='}</Option>
                        <Option value="==">{'=='}</Option>
                        <Option value="!=">{'!='}</Option>
                      </Select>
                    </Col>
                    <Col span={6}>
                      <InputNumber
                        style={{ width: '100%' }}
                        value={cond.value}
                        onChange={(v) => updateAssociationCondition(idx, 'value', v)}
                      />
                    </Col>
                    <Col span={2}>
                      <Button
                        size="small"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => removeAssociationCondition(idx)}
                        disabled={associationConditions.length <= 1}
                      />
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addAssociationCondition} block>
                  添加条件
                </Button>
              </div>
            )}

            {ruleType === 'behavior' && (
              <div>
                <Divider orientation="left" style={{ margin: '8px 0' }} plain>
                  行为规则配置
                </Divider>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item label="行为类型">
                      <Select
                        value={behaviorConfig.behavior_type}
                        onChange={(v) => setBehaviorConfig({ ...behaviorConfig, behavior_type: v })}
                      >
                        <Option value="frequency">高频交易</Option>
                        <Option value="location_change">位置突变</Option>
                        <Option value="amount_spike">金额突增</Option>
                        <Option value="velocity">速度异常</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="时间窗口(分)">
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        value={behaviorConfig.window_minutes}
                        onChange={(v) =>
                          setBehaviorConfig({ ...behaviorConfig, window_minutes: v ?? 60 })
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="阈值">
                      <InputNumber
                        style={{ width: '100%' }}
                        value={behaviorConfig.threshold}
                        onChange={(v) =>
                          setBehaviorConfig({ ...behaviorConfig, threshold: v ?? 0 })
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </div>
            )}

            <Divider orientation="left" style={{ margin: '8px 0' }} plain>
              评分参数
            </Divider>
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item label={`权重（当前: ${weight}）`}>
                  <Slider
                    min={1}
                    max={10}
                    value={weight}
                    onChange={setWeight}
                    marks={{ 1: '1', 5: '5', 10: '10' }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label={`优先级（当前: ${priority}）`}>
                  <Slider
                    min={1}
                    max={100}
                    value={priority}
                    onChange={setPriority}
                    marks={{ 1: '1', 50: '50', 100: '100' }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ margin: '8px 0' }} plain>
              回放参数
            </Divider>
            <Form.Item label="回放天数">
              <Select value={replayDays} onChange={(v) => setReplayDays(v)}>
                <Option value={7}>近7天</Option>
                <Option value={14}>近14天</Option>
                <Option value={30}>近30天</Option>
              </Select>
            </Form.Item>
          </Form>
        </Card>
      </Col>

      <Col span={14}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card title="测试历史">
            <Table
              size="small"
              loading={testsLoading}
              dataSource={tests}
              columns={testColumns}
              rowKey="id"
              pagination={{ pageSize: 5, showSizeChanger: false }}
              onRow={(record) => ({
                onClick: () => handleSelectTest(record),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>

          {selectedTest && (
            <Card
              title={`测试报告 - ${selectedTest.id.substring(0, 8)}`}
              extra={
                <Tag color={getStatusColor(selectedTest.status)}>
                  {getStatusText(selectedTest.status)}
                </Tag>
              }
            >
              <Spin spinning={selectedTest.status === 'running' && selectedTestLoading}>
                {selectedTest.status === 'running' && (
                  <div style={{ marginBottom: 16 }}>
                    <Progress percent={60} status="active" showInfo={false} />
                    <Text type="secondary">测试正在执行，请稍候...</Text>
                  </div>
                )}

                {selectedTest.status !== 'failed' && (
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="回放交易数"
                          value={selectedTest.total_transactions || 0}
                          prefix={<DashboardOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="预估命中率"
                          value={selectedTest.estimated_hit_rate || 0}
                          precision={2}
                          suffix="%"
                          valueStyle={{ color: '#faad14' }}
                          prefix={<ExclamationCircleOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="预估误拦截率"
                          value={selectedTest.estimated_block_rate || 0}
                          precision={2}
                          suffix="%"
                          valueStyle={{ color: '#ff4d4f' }}
                          prefix={<CloseCircleOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="预估漏检率"
                          value={selectedTest.estimated_miss_rate || 0}
                          precision={2}
                          suffix="%"
                          valueStyle={{ color: '#1677ff' }}
                          prefix={<CheckCircleOutlined />}
                        />
                      </Card>
                    </Col>
                  </Row>
                )}

                {selectedTest.status === 'failed' && (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
                    <Title level={4} style={{ marginTop: 12 }}>
                      测试执行失败
                    </Title>
                    <Text type="secondary">请稍后重试或检查配置</Text>
                  </div>
                )}

                {selectedTest.status === 'completed' && (
                  <div>
                    <Divider orientation="left" style={{ margin: '8px 0' }} plain>
                      命中交易样例（前20条）
                    </Divider>
                    <List
                      size="small"
                      bordered
                      dataSource={selectedTest.sample_results || []}
                      locale={{ emptyText: '暂无命中交易' }}
                      renderItem={(item: any, idx) => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={<Tag color="blue">{idx + 1}</Tag>}
                            title={
                              <Space>
                                <Text strong>{item.transaction_no || `交易-${idx + 1}`}</Text>
                                <Tag color="red">命中</Tag>
                                {item.risk_score !== undefined && (
                                  <Text type="secondary">评分: {item.risk_score}</Text>
                                )}
                              </Space>
                            }
                            description={
                              <Space wrap>
                                {item.amount !== undefined && (
                                  <Text type="secondary">
                                    金额: ¥{typeof item.amount === 'number' ? item.amount.toLocaleString() : item.amount}
                                  </Text>
                                )}
                                {item.card_no && <Text type="secondary">卡号: {item.card_no}</Text>}
                                {item.transaction_time && (
                                  <Text type="secondary">
                                    {dayjs(item.transaction_time).format('YYYY-MM-DD HH:mm:ss')}
                                  </Text>
                                )}
                                {typeof item === 'object' && item.rule_hits === undefined && (
                                  <Text type="secondary">
                                    {JSON.stringify(item).substring(0, 200)}
                                  </Text>
                                )}
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  </div>
                )}
              </Spin>
            </Card>
          )}
        </Space>
      </Col>
    </Row>
  );
};

export default Sandbox;
