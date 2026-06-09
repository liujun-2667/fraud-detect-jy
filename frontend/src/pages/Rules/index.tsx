import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Modal,
  Drawer,
  Form,
  Input as AntInput,
  message,
  Dropdown,
  Divider,
  List,
  Typography,
  Row,
  Col,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  StopOutlined,
  ClockCircleOutlined,
  SendOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getRules,
  submitForReview,
  approveRule,
  rejectRule,
  disableRule,
  getRuleVersions,
  compareVersions,
} from '../../api/rules';
import { Rule, RuleType, RuleVersionStatus, RuleVersion } from '../../types';

const { Option } = Select;
const { Text, Paragraph } = Typography;

const Rules: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ruleType, setRuleType] = useState<RuleType | undefined>();
  const [status, setStatus] = useState<RuleVersionStatus | undefined>();
  const [keyword, setKeyword] = useState('');

  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState<Rule | null>(null);
  const [versions, setVersions] = useState<RuleVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [compareVisible, setCompareVisible] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareV1, setCompareV1] = useState<number | null>(null);
  const [compareV2, setCompareV2] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<any>(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectRuleId, setRejectRuleId] = useState<number | null>(null);
  const [rejectVersionId, setRejectVersionId] = useState<number | null>(null);
  const [rejectForm] = Form.useForm();

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await getRules({ page, page_size: pageSize, rule_type: ruleType, status, keyword });
      if (res.code === 0) {
        setRules(res.data?.items || []);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '获取规则列表失败');
      }
    } catch (e: any) {
      message.error(e.message || '获取规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (ruleId: number) => {
    setVersionsLoading(true);
    try {
      const res = await getRuleVersions(ruleId);
      if (res.code === 0) {
        setVersions(res.data || []);
      }
    } catch (e: any) {
      message.error(e.message || '获取版本列表失败');
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [page, pageSize, ruleType, status, keyword]);

  const getLatestVersion = (rule: Rule): RuleVersion | null => {
    if (!rule.versions || rule.versions.length === 0) return null;
    return rule.versions.reduce((latest, v) => (v.version_num > latest.version_num ? v : latest));
  };

  const getRuleTypeText = (type: RuleType) => {
    const map: Record<RuleType, string> = {
      threshold: '阈值规则',
      association: '关联规则',
      behavior: '行为规则',
    };
    return map[type] || type;
  };

  const getRuleTypeColor = (type: RuleType) => {
    const map: Record<RuleType, string> = {
      threshold: 'blue',
      association: 'purple',
      behavior: 'cyan',
    };
    return map[type] || 'default';
  };

  const getStatusText = (status: RuleVersionStatus) => {
    const map: Record<RuleVersionStatus, string> = {
      draft: '草稿',
      reviewing: '审核中',
      active: '已启用',
      disabled: '已停用',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: RuleVersionStatus) => {
    const map: Record<RuleVersionStatus, string> = {
      draft: 'default',
      reviewing: 'gold',
      active: 'green',
      disabled: 'red',
    };
    return map[status] || 'default';
  };

  const handleSubmitReview = async (rule: Rule) => {
    Modal.confirm({
      title: '提交审核',
      content: `确定要将规则「${rule.name}」提交审核吗？`,
      onOk: async () => {
        try {
          const res = await submitForReview(rule.id);
          if (res.code === 0) {
            message.success('提交审核成功');
            loadRules();
          } else {
            message.error(res.message || '提交审核失败');
          }
        } catch (e: any) {
          message.error(e.message || '提交审核失败');
        }
      },
    });
  };

  const handleApprove = async (rule: Rule, version: RuleVersion) => {
    Modal.confirm({
      title: '通过审核',
      content: `确定要通过规则「${rule.name}」v${version.version_num} 的审核吗？通过后将自动启用。`,
      okType: 'primary',
      onOk: async () => {
        try {
          const res = await approveRule(rule.id, version.id);
          if (res.code === 0) {
            message.success('审核通过成功');
            loadRules();
          } else {
            message.error(res.message || '审核通过失败');
          }
        } catch (e: any) {
          message.error(e.message || '审核通过失败');
        }
      },
    });
  };

  const handleReject = (rule: Rule, version: RuleVersion) => {
    setRejectRuleId(rule.id);
    setRejectVersionId(version.id);
    setRejectModalVisible(true);
    rejectForm.resetFields();
  };

  const handleRejectConfirm = async () => {
    try {
      const values = await rejectForm.validateFields();
      if (rejectRuleId !== null && rejectVersionId !== null) {
        const res = await rejectRule(rejectRuleId, rejectVersionId, values.reason);
        if (res.code === 0) {
          message.success('驳回成功');
          setRejectModalVisible(false);
          loadRules();
        } else {
          message.error(res.message || '驳回失败');
        }
      }
    } catch {
    }
  };

  const handleDisable = async (rule: Rule, version: RuleVersion) => {
    Modal.confirm({
      title: '停用规则',
      content: `确定要停用规则「${rule.name}」v${version.version_num} 吗？停用后该版本将不再生效。`,
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await disableRule(rule.id, version.id);
          if (res.code === 0) {
            message.success('停用成功');
            loadRules();
          } else {
            message.error(res.message || '停用失败');
          }
        } catch (e: any) {
          message.error(e.message || '停用失败');
        }
      },
    });
  };

  const handleOpenVersions = async (rule: Rule) => {
    setCurrentRule(rule);
    setVersionDrawerOpen(true);
    await loadVersions(rule.id);
  };

  const handleCompare = async () => {
    if (!compareV1 || !compareV2) {
      message.warning('请选择两个版本进行对比');
      return;
    }
    setCompareLoading(true);
    try {
      const res = await compareVersions(compareV1, compareV2);
      if (res.code === 0) {
        setCompareResult(res.data);
        setCompareVisible(true);
      } else {
        message.error(res.message || '版本对比失败');
      }
    } catch (e: any) {
      message.error(e.message || '版本对比失败');
    } finally {
      setCompareLoading(false);
    }
  };

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Rule) => (
        <a onClick={() => handleOpenVersions(record)} style={{ fontWeight: 500 }}>
          {text}
        </a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 100,
      render: (type: RuleType) => <Tag color={getRuleTypeColor(type)}>{getRuleTypeText(type)}</Tag>,
    },
    {
      title: '最新版本',
      key: 'latest_version',
      width: 120,
      render: (_: any, record: Rule) => {
        const latest = getLatestVersion(record);
        return latest ? `v${latest.version_num}` : '-';
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: Rule) => {
        const latest = getLatestVersion(record);
        return latest ? (
          <Tag color={getStatusColor(latest.status)} icon={getStatusIcon(latest.status)}>
            {getStatusText(latest.status)}
          </Tag>
        ) : (
          '-'
        );
      },
    },
    {
      title: '权重',
      key: 'weight',
      width: 80,
      render: (_: any, record: Rule) => {
        const latest = getLatestVersion(record);
        return latest ? latest.weight : '-';
      },
    },
    {
      title: '优先级',
      key: 'priority',
      width: 80,
      render: (_: any, record: Rule) => {
        const latest = getLatestVersion(record);
        return latest ? latest.priority : '-';
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_: any, record: Rule) => {
        const latest = getLatestVersion(record);
        const canSubmit = latest?.status === 'draft';
        const canApprove = latest?.status === 'reviewing';
        const canDisable = latest?.status === 'active';

        const dropdownItems: any = [];
        if (canApprove) {
          dropdownItems.push({
            key: 'approve',
            icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
            label: '通过审核',
            onClick: () => latest && handleApprove(record, latest),
          });
          dropdownItems.push({
            key: 'reject',
            icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
            label: '驳回',
            onClick: () => latest && handleReject(record, latest),
          });
        }
        if (canDisable) {
          dropdownItems.push({
            key: 'disable',
            icon: <StopOutlined style={{ color: '#ff4d4f' }} />,
            label: '停用',
            onClick: () => latest && handleDisable(record, latest),
          });
        }

        return (
          <Space size="small">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleOpenVersions(record)}>
              详情
            </Button>
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={() => navigate(`/rules/${record.id}/edit`)}
            >
              编辑
            </Button>
            {canSubmit && (
              <Button
                size="small"
                type="link"
                icon={<SendOutlined />}
                onClick={() => handleSubmitReview(record)}
              >
                提交审核
              </Button>
            )}
            {dropdownItems.length > 0 && (
              <Dropdown
                menu={{ items: dropdownItems }}
                trigger={['click']}
              >
                <Button size="small">更多</Button>
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  const getStatusIcon = (status: RuleVersionStatus) => {
    switch (status) {
      case 'active':
        return <CheckCircleOutlined />;
      case 'reviewing':
        return <ClockCircleOutlined />;
      case 'disabled':
        return <StopOutlined />;
      default:
        return null;
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="规则管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rules/new')}>
            新建规则
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="规则类型"
            allowClear
            style={{ width: 140 }}
            value={ruleType}
            onChange={(val) => {
              setRuleType(val);
              setPage(1);
            }}
          >
            <Option value="threshold">阈值规则</Option>
            <Option value="association">关联规则</Option>
            <Option value="behavior">行为规则</Option>
          </Select>
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 140 }}
            value={status}
            onChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
          >
            <Option value="draft">草稿</Option>
            <Option value="reviewing">审核中</Option>
            <Option value="active">已启用</Option>
            <Option value="disabled">已停用</Option>
          </Select>
          <Input
            placeholder="搜索规则名称"
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => setPage(1)}
          />
          <Button onClick={loadRules}>查询</Button>
        </Space>

        <Table
          loading={loading}
          dataSource={rules}
          columns={columns}
          rowKey="id"
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
      </Card>

      <Drawer
        title={currentRule ? `规则「${currentRule.name}」版本历史` : '版本历史'}
        width={800}
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
      >
        {currentRule && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="规则类型">{getRuleTypeText(currentRule.rule_type)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(currentRule.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              {currentRule.description && (
                <Descriptions.Item label="描述" span={2}>
                  {currentRule.description}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card
              size="small"
              title="对比版本"
              style={{ marginBottom: 16 }}
              extra={
                <Button
                  type="primary"
                  icon={<SwapOutlined />}
                  onClick={handleCompare}
                  loading={compareLoading}
                  disabled={!compareV1 || !compareV2}
                >
                  对比
                </Button>
              }
            >
              <Row gutter={8}>
                <Col span={10}>
                  <Select
                    placeholder="选择版本1"
                    style={{ width: '100%' }}
                    value={compareV1 || undefined}
                    onChange={(val) => setCompareV1(val)}
                  >
                    {versions.map((v) => (
                      <Option key={v.id} value={v.id}>
                        v{v.version_num} - {getStatusText(v.status)}
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col span={4} style={{ textAlign: 'center', paddingTop: 6 }}>
                  <SwapOutlined />
                </Col>
                <Col span={10}>
                  <Select
                    placeholder="选择版本2"
                    style={{ width: '100%' }}
                    value={compareV2 || undefined}
                    onChange={(val) => setCompareV2(val)}
                  >
                    {versions.map((v) => (
                      <Option key={v.id} value={v.id}>
                        v{v.version_num} - {getStatusText(v.status)}
                      </Option>
                    ))}
                  </Select>
                </Col>
              </Row>
            </Card>

            <Divider orientation="left">版本列表</Divider>
            <List
              loading={versionsLoading}
              dataSource={versions}
              renderItem={(item) => (
                <List.Item key={item.id}>
                  <List.Item.Meta
                    avatar={
                      <Tag color={getStatusColor(item.status)} style={{ fontSize: 14, padding: '4px 12px' }}>
                        v{item.version_num}
                      </Tag>
                    }
                    title={
                      <Space>
                        <Tag color={getStatusColor(item.status)}>{getStatusText(item.status)}</Tag>
                        <Text type="secondary">权重: {item.weight}</Text>
                        <Text type="secondary">优先级: {item.priority}</Text>
                        {item.is_immediate_block && <Tag color="red">立即拦截</Tag>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4}>
                        <Text type="secondary">创建于 {dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                        {item.created_by && <Text type="secondary">创建人: {item.created_by}</Text>}
                        {item.reviewed_by && (
                          <Text type="secondary">
                            审核人: {item.reviewed_by} @ {dayjs(item.reviewed_at).format('YYYY-MM-DD HH:mm:ss')}
                          </Text>
                        )}
                        <Paragraph type="secondary" style={{ margin: 0 }}>
                          配置: {JSON.stringify(item.config)}
                        </Paragraph>
                      </Space>
                    }
                  />
                  <Space>
                    {item.status === 'reviewing' && (
                      <>
                        <Button size="small" type="primary" onClick={() => handleApprove(currentRule, item)}>
                          通过
                        </Button>
                        <Button size="small" danger onClick={() => handleReject(currentRule, item)}>
                          驳回
                        </Button>
                      </>
                    )}
                    {item.status === 'active' && (
                      <Button size="small" danger onClick={() => handleDisable(currentRule, item)}>
                        停用
                      </Button>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="版本对比结果"
        open={compareVisible}
        onCancel={() => setCompareVisible(false)}
        footer={[
          <Button key="close" onClick={() => setCompareVisible(false)}>
            关闭
          </Button>,
        ]}
        width={900}
      >
        {compareResult ? (
          <div>
            <Descriptions column={1} size="small" bordered>
              {Object.entries(compareResult).map(([key, val]) => (
                <Descriptions.Item key={key} label={key}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                  </pre>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </div>
        ) : (
          <Text type="secondary">无差异数据</Text>
        )}
      </Modal>

      <Modal
        title="驳回规则"
        open={rejectModalVisible}
        onCancel={() => setRejectModalVisible(false)}
        onOk={handleRejectConfirm}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            label="驳回原因"
            name="reason"
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <AntInput.TextArea rows={4} placeholder="请输入驳回原因..." />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default Rules;
