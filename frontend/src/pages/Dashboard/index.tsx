import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Space,
  Button,
  Segmented,
  Spin,
  Alert,
  Table,
  Tag,
  message,
  Drawer,
  Empty,
  List,
} from 'antd';
import {
  DashboardOutlined,
  StopOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  FileSearchOutlined,
  UserOutlined,
  ClockCircleOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { Line, Column, Heatmap, Pie } from '@ant-design/charts';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  getDashboardOverview,
  getTrend,
  getRuleHitStats,
  getRegionHeatmap,
  getHourHeatmap,
  getAmountRangeHeatmap,
  getAlertStats,
  getRuleTransactions,
} from '../../api/dashboard';
import { getTemplateUsageDistribution } from '../../api/templates';
import {
  DashboardOverview as DashboardOverviewType,
  TrendPoint,
  RuleHitStat,
  HeatmapPoint,
  Transaction,
  TemplateUsageStat,
  CaseStats,
} from '../../types';
import { useCaseStore } from '../../store/useCaseStore';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { getStats: getCaseStatsData } = useCaseStore();
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overview, setOverview] = useState<DashboardOverviewType | null>(null);
  const [caseStats, setCaseStats] = useState<CaseStats | null>(null);
  const [trendDays, setTrendDays] = useState<number>(7);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [ruleHitLoading, setRuleHitLoading] = useState(false);
  const [ruleHitData, setRuleHitData] = useState<RuleHitStat[]>([]);
  const [regionHeatmapLoading, setRegionHeatmapLoading] = useState(false);
  const [regionHeatmapData, setRegionHeatmapData] = useState<HeatmapPoint[]>([]);
  const [hourHeatmapLoading, setHourHeatmapLoading] = useState(false);
  const [hourHeatmapData, setHourHeatmapData] = useState<HeatmapPoint[]>([]);
  const [amountRangeLoading, setAmountRangeLoading] = useState(false);
  const [amountRangeData, setAmountRangeData] = useState<HeatmapPoint[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertData, setAlertData] = useState<any>(null);
  const [templateUsageLoading, setTemplateUsageLoading] = useState(false);
  const [templateUsageData, setTemplateUsageData] = useState<TemplateUsageStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ruleTransactionsDrawer, setRuleTransactionsDrawer] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleHitStat | null>(null);
  const [ruleTransactionsLoading, setRuleTransactionsLoading] = useState(false);
  const [ruleTransactions, setRuleTransactions] = useState<Transaction[]>([]);

  const loadOverview = async () => {
    setOverviewLoading(true);
    setError(null);
    try {
      const res = await getDashboardOverview(24);
      if (res.code === 0) {
        setOverview(res.data);
      } else {
        setError(res.message || '获取概览数据失败');
      }
    } catch (e: any) {
      setError(e.message || '获取概览数据失败');
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadCaseStats = async () => {
    try {
      const stats = await getCaseStatsData();
      setCaseStats(stats);
    } catch (e: any) {
      // silent
    }
  };

  const loadTrend = async (days: number) => {
    setTrendLoading(true);
    try {
      const res = await getTrend(days);
      if (res.code === 0) {
        setTrendData(res.data || []);
      }
    } catch (e: any) {
      message.error(e.message || '获取趋势数据失败');
    } finally {
      setTrendLoading(false);
    }
  };

  const loadRuleHitStats = async () => {
    setRuleHitLoading(true);
    try {
      const res = await getRuleHitStats();
      if (res.code === 0) {
        setRuleHitData(res.data || []);
      }
    } catch (e: any) {
      message.error(e.message || '获取规则命中统计失败');
    } finally {
      setRuleHitLoading(false);
    }
  };

  const loadHeatmaps = async () => {
    setRegionHeatmapLoading(true);
    setHourHeatmapLoading(true);
    setAmountRangeLoading(true);
    try {
      const [regionRes, hourRes, amountRes] = await Promise.all([
        getRegionHeatmap(),
        getHourHeatmap(),
        getAmountRangeHeatmap(),
      ]);
      if (regionRes.code === 0) setRegionHeatmapData(regionRes.data || []);
      if (hourRes.code === 0) setHourHeatmapData(hourRes.data || []);
      if (amountRes.code === 0) setAmountRangeData(amountRes.data || []);
    } catch (e: any) {
      message.error(e.message || '获取热力图数据失败');
    } finally {
      setRegionHeatmapLoading(false);
      setHourHeatmapLoading(false);
      setAmountRangeLoading(false);
    }
  };

  const loadTemplateUsage = async () => {
    setTemplateUsageLoading(true);
    try {
      const res = await getTemplateUsageDistribution();
      if (res.code === 0) {
        setTemplateUsageData(res.data || []);
      }
    } catch (e: any) {
      // silent
    } finally {
      setTemplateUsageLoading(false);
    }
  };

  const loadAlertStats = async () => {
    setAlertLoading(true);
    try {
      const res = await getAlertStats(7);
      if (res.code === 0) {
        setAlertData(res.data);
      }
    } catch (e: any) {
      message.error(e.message || '获取告警统计失败');
    } finally {
      setAlertLoading(false);
    }
  };

  const loadRuleTransactions = async (ruleId: number) => {
    setRuleTransactionsLoading(true);
    try {
      const res = await getRuleTransactions(ruleId, { page: 1, page_size: 50 });
      if (res.code === 0) {
        setRuleTransactions(res.data?.items || []);
      }
    } catch (e: any) {
      message.error(e.message || '获取规则命中交易失败');
    } finally {
      setRuleTransactionsLoading(false);
    }
  };

  const refreshAll = () => {
    loadOverview();
    loadCaseStats();
    loadTrend(trendDays);
    loadRuleHitStats();
    loadHeatmaps();
    loadAlertStats();
    loadTemplateUsage();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    loadTrend(trendDays);
  }, [trendDays]);

  const transformTrendData = (data: TrendPoint[]) => {
    const result: any[] = [];
    data.forEach((item) => {
      result.push({ date: item.date, type: '总交易量', value: item.total });
      result.push({ date: item.date, type: '拦截', value: item.block });
      result.push({ date: item.date, type: '待审核', value: item.review });
      result.push({ date: item.date, type: '通过', value: item.allow });
    });
    return result;
  };

  const handleRuleHitClick = (datum: any) => {
    if (datum?.rule_id) {
      const rule = ruleHitData.find((r) => r.rule_id === datum.rule_id);
      if (rule) {
        setSelectedRule(rule);
        loadRuleTransactions(rule.rule_id);
        setRuleTransactionsDrawer(true);
      }
    }
  };

  const getDecisionColor = (decision?: string) => {
    switch (decision) {
      case 'block':
        return 'red';
      case 'review':
        return 'orange';
      case 'allow':
        return 'green';
      default:
        return 'default';
    }
  };

  const getDecisionText = (decision?: string) => {
    switch (decision) {
      case 'block':
        return '拦截';
      case 'review':
        return '待审核';
      case 'allow':
        return '通过';
      default:
        return '-';
    }
  };

  const ruleTransactionsColumns = [
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
      width: 180,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => (val > 10000 ? <span style={{ color: '#ff4d4f' }}>¥{val.toLocaleString()}</span> : `¥${val.toLocaleString()}`),
    },
    {
      title: '风险评分',
      dataIndex: ['evaluation', 'risk_score'],
      key: 'risk_score',
      render: (val?: number) => (val !== undefined ? val : '-'),
    },
    {
      title: '决策',
      dataIndex: ['evaluation', 'decision'],
      key: 'decision',
      render: (val?: string) => <Tag color={getDecisionColor(val)}>{getDecisionText(val)}</Tag>,
    },
    {
      title: '交易时间',
      dataIndex: 'transaction_time',
      key: 'transaction_time',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
  ];

  const alertColumns = [
    {
      title: '告警类型',
      dataIndex: 'alert_type',
      key: 'alert_type',
      render: (val: string) => val || '-',
    },
    {
      title: '数量',
      dataIndex: 'count',
      key: 'count',
    },
    {
      title: '已处理',
      dataIndex: 'handled_count',
      key: 'handled_count',
    },
    {
      title: '处理率',
      dataIndex: 'handled_rate',
      key: 'handled_rate',
      render: (val?: number) => (val !== undefined ? `${(val * 100).toFixed(2)}%` : '-'),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      <Card
        title="实时监控看板"
        extra={
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>
            刷新
          </Button>
        }
      >
        <Row gutter={16}>
          <Col span={6}>
            <Card loading={overviewLoading}>
              <Statistic
                title="总交易量"
                value={overview?.total_transactions || 0}
                prefix={<DashboardOutlined />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={overviewLoading}>
              <Statistic
                title="拦截数"
                value={overview?.block_count || 0}
                prefix={<StopOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={overviewLoading}>
              <Statistic
                title="拦截率"
                value={overview?.block_rate || 0}
                precision={2}
                suffix="%"
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card loading={overviewLoading}>
              <Statistic
                title="待审核"
                value={overview?.review_count || 0}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="案件处理统计"
        extra={
          <Button type="link" onClick={() => navigate('/cases')}>
            查看工作台
          </Button>
        }
      >
        <Row gutter={16}>
          <Col span={4}>
            <Card>
              <Statistic
                title="待分配案件"
                value={caseStats?.pending_count || 0}
                prefix={<FileSearchOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="调查中案件"
                value={caseStats?.investigating_count || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col span={4}>
            <Card>
              <Statistic
                title="超时未结案件"
                value={caseStats?.overtime_count || 0}
                prefix={<AlertOutlined />}
                valueStyle={{ color: '#ff4d4f', fontWeight: 600 }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日结案数"
                value={caseStats?.today_closed_count || 0}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均处理时长"
                value={caseStats?.avg_processing_hours || 0}
                precision={1}
                suffix="小时"
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="交易趋势"
        extra={
          <Segmented
            value={trendDays}
            onChange={(val) => setTrendDays(val as number)}
            options={[
              { label: '24小时', value: 1 },
              { label: '7天', value: 7 },
              { label: '30天', value: 30 },
            ]}
          />
        }
      >
        <Spin spinning={trendLoading}>
          <Line
            data={transformTrendData(trendData)}
            xField="date"
            yField="value"
            seriesField="type"
            height={320}
            smooth
            legend={{ position: 'top' }}
            color={['#1677ff', '#ff4d4f', '#faad14', '#52c41a']}
            point={{ size: 3, shape: 'circle' }}
            yAxis={{ title: { text: '交易数' } }}
          />
        </Spin>
      </Card>

      <Card title="规则命中统计">
        <Spin spinning={ruleHitLoading}>
          <Column
            data={ruleHitData}
            xField="rule_name"
            yField="hit_count"
            height={320}
            columnWidthRatio={0.6}
            label={{
              position: 'top',
              style: { fill: '#000', opacity: 0.6 },
            }}
            color="#1677ff"
            xAxis={{ label: { autoHide: true, autoRotate: false } }}
            onReady={(plot) => {
              plot.on('element:click', (evt: any) => {
                const { data } = evt;
                if (data?.data) {
                  handleRuleHitClick(data.data);
                }
              });
            }}
          />
        </Spin>
      </Card>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="地域热力图" loading={regionHeatmapLoading}>
            <Heatmap
              data={regionHeatmapData.map((item) => ({
                region: item.region || item.region_code || '未知',
                type: '风险比',
                value: Number((item.risk_ratio * 100).toFixed(2)),
              }))}
              xField="region"
              yField="type"
              colorField="value"
              height={280}
              color={['#bae7ff', '#91caff', '#69b1ff', '#4096ff', '#1677ff', '#0958d9']}
              xAxis={{ label: { autoHide: true, autoRotate: true } }}
              tooltip={{
                formatter: (datum: any) => ({
                  name: '风险比',
                  value: `${datum.value}%`,
                }),
              }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="时段热力图" loading={hourHeatmapLoading}>
            <Heatmap
              data={hourHeatmapData.map((item) => ({
                hour: `${item.hour || 0}:00`,
                type: '风险比',
                value: Number((item.risk_ratio * 100).toFixed(2)),
              }))}
              xField="hour"
              yField="type"
              colorField="value"
              height={280}
              color={['#ffccc7', '#ffa39e', '#ff7875', '#ff4d4f', '#f5222d', '#cf1322']}
              xAxis={{ label: { autoHide: true, autoRotate: true } }}
              tooltip={{
                formatter: (datum: any) => ({
                  name: '风险比',
                  value: `${datum.value}%`,
                }),
              }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="金额区间热力图" loading={amountRangeLoading}>
            <Heatmap
              data={amountRangeData.map((item) => ({
                range: item.range_label || '未知',
                type: '风险比',
                value: Number((item.risk_ratio * 100).toFixed(2)),
              }))}
              xField="range"
              yField="type"
              colorField="value"
              height={280}
              color={['#fff1b8', '#ffe58f', '#ffd666', '#ffc53d', '#faad14', '#d48806']}
              xAxis={{ label: { autoHide: true, autoRotate: true } }}
              tooltip={{
                formatter: (datum: any) => ({
                  name: '风险比',
                  value: `${datum.value}%`,
                }),
              }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="模板使用分布">
        <Spin spinning={templateUsageLoading}>
          {templateUsageData.length === 0 ? (
            <Empty description="暂无模板使用数据" style={{ padding: 40 }} />
          ) : (
            <Row gutter={16} align="middle">
              <Col span={14}>
                <Pie
                  data={templateUsageData.map((item) => ({
                    type: item.template_name,
                    value: item.use_count,
                  }))}
                  angleField="value"
                  colorField="type"
                  radius={0.9}
                  height={320}
                  label={{
                    text: 'type',
                    style: { fontSize: 11 },
                  }}
                  legend={{ position: 'right' }}
                  tooltip={{
                    formatter: (datum: any) => {
                      const stat = templateUsageData.find(
                        (s) => s.template_name === datum.type,
                      );
                      return {
                        name: datum.type,
                        value: `${datum.value} 次 (${stat?.percentage || 0}%)`,
                      };
                    },
                  }}
                />
              </Col>
              <Col span={10}>
                <List
                  size="small"
                  header={<div style={{ fontWeight: 500 }}>使用排行</div>}
                  bordered
                  dataSource={templateUsageData}
                  renderItem={(item, idx) => (
                    <List.Item>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                          <Tag color={idx === 0 ? 'red' : idx === 1 ? 'orange' : idx === 2 ? 'gold' : 'blue'}>
                            #{idx + 1}
                          </Tag>
                          <span>{item.template_name}</span>
                        </Space>
                        <Space>
                          <Tag color="red">{item.use_count} 次</Tag>
                          <Tag color="cyan">{item.percentage}%</Tag>
                        </Space>
                      </Space>
                    </List.Item>
                  )}
                />
              </Col>
            </Row>
          )}
        </Spin>
      </Card>

      <Card title="告警统计与处理率">
        <Spin spinning={alertLoading}>
          <Table
            dataSource={
              alertData
                ? Array.isArray(alertData)
                  ? alertData
                  : alertData.items || alertData.alerts || []
                : []
            }
            columns={alertColumns}
            rowKey="id"
            pagination={false}
          />
        </Spin>
      </Card>

      <Drawer
        title={selectedRule ? `规则「${selectedRule.rule_name}」命中交易` : '命中交易'}
        open={ruleTransactionsDrawer}
        width={900}
        onClose={() => setRuleTransactionsDrawer(false)}
      >
        <Table
          loading={ruleTransactionsLoading}
          dataSource={ruleTransactions}
          columns={ruleTransactionsColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Drawer>
    </Space>
  );
};

export default Dashboard;
