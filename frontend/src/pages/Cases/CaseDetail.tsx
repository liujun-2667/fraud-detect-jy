import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Descriptions,
  Tag,
  Space,
  Button,
  Form,
  Input,
  Select,
  message,
  Timeline,
  Empty,
  Divider,
  Typography,
  Tooltip,
  Badge,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  EnvironmentOutlined,
  ShopOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useParams, useNavigate } from 'react-router-dom';
import { useCaseStore } from '../../store/useCaseStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getCaseById } from '../../api/cases';
import {
  Case,
  CaseStatus,
  CaseRiskLevel,
  CaseConclusion,
  CaseHistoryTxn,
  DecisionType,
} from '../../types';

const { Option } = Select;
const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { getCase, assignCase, closeCase, addNote } = useCaseStore();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [closeForm] = Form.useForm();
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const loadCase = async () => {
    if (!id) return;
    setLoading(true);
    try {
      try {
        const res = await getCaseById(Number(id));
        if (res.code === 0 && res.data) {
          setCaseData(res.data);
        } else {
          const c = getCase(Number(id));
          setCaseData(c || null);
        }
      } catch {
        const c = getCase(Number(id));
        setCaseData(c || null);
      }
    } catch (e: any) {
      message.error(e.message || '获取案件详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCase();
  }, [id]);

  const handleAssign = async () => {
    if (!id || !user || !caseData) return;
    const result = await assignCase(Number(id), user.id, user.name);
    if (result) {
      message.success('案件认领成功');
      setCaseData(result);
    } else {
      message.error('案件认领失败');
    }
  };

  const handleAddNote = async () => {
    if (!id || !user || !noteContent.trim()) {
      message.warning('请输入备注内容');
      return;
    }
    setNoteSubmitting(true);
    try {
      const result = await addNote(Number(id), noteContent.trim(), user.name);
      if (result) {
        message.success('备注添加成功');
        setCaseData(result);
        setNoteContent('');
      } else {
        message.error('添加备注失败');
      }
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleCloseCase = async () => {
    if (!id || !caseData) return;
    try {
      const values = await closeForm.validateFields();
      if (values.conclusion_note.trim().length < 20) {
        message.error('调查结论不少于20字');
        return;
      }
      setCloseSubmitting(true);
      const result = await closeCase(Number(id), values.conclusion, values.conclusion_note.trim());
      if (result) {
        message.success('案件已结案');
        setCaseData(result);
      } else {
        message.error('结案失败');
      }
    } catch (e: any) {
      if (!e?.errorFields) {
        message.error(e.message || '结案失败');
      }
    } finally {
      setCloseSubmitting(false);
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

  const getConclusionColor = (conclusion?: CaseConclusion): string => {
    if (!conclusion) return 'default';
    const map: Record<CaseConclusion, string> = {
      pass: 'green',
      fraud: 'red',
      false_positive: 'default',
    };
    return map[conclusion];
  };

  const getConclusionText = (conclusion?: CaseConclusion): string => {
    if (!conclusion) return '-';
    const map: Record<CaseConclusion, string> = {
      pass: '通过',
      fraud: '欺诈确认',
      false_positive: '误报',
    };
    return map[conclusion];
  };

  const getDecisionColor = (decision?: DecisionType): string => {
    if (!decision) return 'default';
    const map: Record<DecisionType, string> = {
      block: 'red',
      review: 'orange',
      allow: 'green',
    };
    return map[decision];
  };

  const getDecisionText = (decision?: DecisionType): string => {
    if (!decision) return '-';
    const map: Record<DecisionType, string> = {
      block: '拦截',
      review: '待审核',
      allow: '通过',
    };
    return map[decision];
  };

  const canAssign = caseData?.status === 'pending';
  const canClose =
    caseData?.status === 'investigating' &&
    caseData?.assigned_to === user?.id;
  const isClosed = caseData?.status === 'closed';

  if (!caseData && !loading) {
    return (
      <Card>
        <Empty description="案件不存在" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/cases')}>返回案件列表</Button>
        </div>
      </Card>
    );
  }

  const txn = caseData?.transaction;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        loading={loading}
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/cases')}
            />
            <span>案件详情</span>
            <Text strong>{caseData?.case_no}</Text>
            <Tag color={getStatusColor(caseData?.status as CaseStatus)}>
              {getStatusText(caseData?.status as CaseStatus)}
            </Tag>
            <Tag color={getRiskLevelColor(caseData?.risk_level as CaseRiskLevel)}>
              {getRiskLevelText(caseData?.risk_level as CaseRiskLevel)}
            </Tag>
            {isClosed && caseData?.conclusion && (
              <Tag color={getConclusionColor(caseData.conclusion)}>
                {getConclusionText(caseData.conclusion)}
              </Tag>
            )}
          </Space>
        }
      >
        <Row gutter={24}>
          <Col span={16}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions
                column={2}
                bordered
                size="small"
                title={
                  <Space>
                    <ShopOutlined />
                    <span>交易上下文</span>
                  </Space>
                }
              >
                <Descriptions.Item label="交易号" span={2}>
                  {txn?.transaction_no}
                </Descriptions.Item>
                <Descriptions.Item label="交易时间">
                  <Space>
                    <ClockCircleOutlined />
                    {txn && dayjs(txn.transaction_time).format('YYYY-MM-DD HH:mm:ss')}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="交易金额">
                  {txn && txn.amount > 50000 ? (
                    <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
                      ¥{txn.amount.toLocaleString()}
                    </span>
                  ) : txn ? (
                    `¥${txn.amount.toLocaleString()}`
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="卡号">
                  {txn?.card_no || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="卡号哈希">
                  <Text copyable>{txn?.card_hash || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="商户">
                  <Space>
                    <ShopOutlined />
                    {txn?.merchant_name || '-'}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="商户ID">
                  {txn?.merchant_id || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="地理位置">
                  <Space>
                    <EnvironmentOutlined />
                    {txn?.region || '-'}
                    {txn?.is_overseas && <Tag color="red">境外</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="设备指纹">
                  <Space>
                    <DesktopOutlined />
                    <Text copyable>{txn?.device_id || '-'}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="经纬度">
                  {txn?.lat && txn?.lng
                    ? `${txn.lat.toFixed(4)}, ${txn.lng.toFixed(4)}`
                    : '-'}
                </Descriptions.Item>
              </Descriptions>

              <Card
                size="small"
                title={
                  <Space>
                    <WarningOutlined style={{ color: '#faad14' }} />
                    <span>命中规则列表</span>
                    <Tag color="red">共 {caseData?.rule_hits?.length || 0} 条</Tag>
                    <Text type="secondary">
                      累计贡献分值:{' '}
                      <Text strong style={{ color: '#ff4d4f' }}>
                        {caseData?.rule_hits?.reduce((s, h) => s + h.score, 0) || 0}
                      </Text>
                    </Text>
                  </Space>
                }
              >
                {caseData?.rule_hits && caseData.rule_hits.length > 0 ? (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {caseData.rule_hits.map((hit, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 16px',
                          background: '#fff2e8',
                          borderRadius: 6,
                          border: '1px solid #ffd591',
                        }}
                      >
                        <Row justify="space-between" align="middle">
                          <Col>
                            <Space>
                              <Badge color="red" />
                              <Text strong>{hit.rule_name}</Text>
                            </Space>
                          </Col>
                          <Col>
                            <Tag color="red" style={{ fontWeight: 600 }}>
                              +{hit.score} 分
                            </Tag>
                          </Col>
                        </Row>
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary">触发条件：</Text>
                          <Text>{hit.trigger_condition}</Text>
                        </div>
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Empty description="无命中规则" />
                )}
              </Card>

              <Card
                size="small"
                title={
                  <Space>
                    <ClockCircleOutlined />
                    <span>同一用户近7天历史交易时间线</span>
                    <Tag color="blue">共 {caseData?.history_transactions?.length || 0} 笔</Tag>
                  </Space>
                }
              >
                {caseData?.history_transactions &&
                caseData.history_transactions.length > 0 ? (
                  <Timeline
                    mode="left"
                    items={caseData.history_transactions.map((h: CaseHistoryTxn) => ({
                      color: h.is_abnormal ? 'red' : 'blue',
                      label: (
                        <div style={{ textAlign: 'left' }}>
                          <Text type="secondary">
                            {dayjs(h.transaction_time).format('YYYY-MM-DD HH:mm:ss')}
                          </Text>
                        </div>
                      ),
                      children: (
                        <div
                          style={{
                            padding: '8px 12px',
                            background: h.is_abnormal ? '#fff1f0' : '#f0f5ff',
                            border: `1px solid ${h.is_abnormal ? '#ffa39e' : '#91caff'}`,
                            borderRadius: 6,
                          }}
                        >
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Space>
                              <Text strong>{h.transaction_no}</Text>
                              {h.is_abnormal && <Tag color="red">异常</Tag>}
                            </Space>
                            <Space size="large">
                              <span>
                                金额:{' '}
                                <Text
                                  strong
                                  style={{
                                    color: h.amount > 50000 ? '#ff4d4f' : 'inherit',
                                  }}
                                >
                                  ¥{h.amount.toLocaleString()}
                                </Text>
                              </span>
                              <span>
                                风险评分:{' '}
                                <Text
                                  strong
                                  style={{
                                    color:
                                      h.risk_score >= 71
                                        ? '#ff4d4f'
                                        : h.risk_score >= 41
                                        ? '#faad14'
                                        : '#52c41a',
                                  }}
                                >
                                  {h.risk_score}
                                </Text>
                              </span>
                              <Tag color={getDecisionColor(h.decision)}>
                                {getDecisionText(h.decision)}
                              </Tag>
                            </Space>
                          </Space>
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <Empty description="暂无历史交易" />
                )}
              </Card>
            </Space>
          </Col>

          <Col span={8}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card
                size="small"
                title={
                  <Space>
                    <UserOutlined />
                    <span>案件信息</span>
                  </Space>
                }
              >
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="案件编号">
                    {caseData?.case_no}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {caseData && dayjs(caseData.created_at).format('YYYY-MM-DD HH:mm:ss')}
                  </Descriptions.Item>
                  <Descriptions.Item label="认领人">
                    {caseData?.assigned_to_name || (
                      <Text type="secondary">未分配</Text>
                    )}
                  </Descriptions.Item>
                  {caseData?.assigned_at && (
                    <Descriptions.Item label="认领时间">
                      {dayjs(caseData.assigned_at).format('YYYY-MM-DD HH:mm:ss')}
                    </Descriptions.Item>
                  )}
                  {caseData?.closed_at && (
                    <Descriptions.Item label="结案时间">
                      {dayjs(caseData.closed_at).format('YYYY-MM-DD HH:mm:ss')}
                    </Descriptions.Item>
                  )}
                  {caseData?.closed_at && (
                    <Descriptions.Item label="处理时长">
                      {dayjs(caseData.closed_at).diff(
                        dayjs(caseData.created_at),
                        'hour',
                        true,
                      ).toFixed(1)}{' '}
                      小时
                    </Descriptions.Item>
                  )}
                </Descriptions>

                <Divider style={{ margin: '12px 0' }} />

                {canAssign && (
                  <Button
                    type="primary"
                    block
                    size="large"
                    icon={<UserOutlined />}
                    onClick={handleAssign}
                  >
                    认领此案件
                  </Button>
                )}

                {caseData?.status === 'investigating' &&
                  caseData?.assigned_to !== user?.id && (
                    <Alert
                      type="info"
                      showIcon
                      message={`该案件已由 ${caseData?.assigned_to_name} 认领处理中`}
                    />
                  )}

                {isClosed && caseData?.conclusion_note && (
                  <Alert
                    type={
                      caseData.conclusion === 'fraud'
                        ? 'error'
                        : caseData.conclusion === 'false_positive'
                        ? 'warning'
                        : 'success'
                    }
                    showIcon
                    message={`结案结论：${getConclusionText(caseData.conclusion)}`}
                    description={caseData.conclusion_note}
                  />
                )}
              </Card>

              {canClose && (
                <Card
                  size="small"
                  title={
                    <Space>
                      <CheckCircleOutlined />
                      <span>结案处理</span>
                    </Space>
                  }
                >
                  <Form form={closeForm} layout="vertical">
                    <Form.Item
                      label="结案结论"
                      name="conclusion"
                      rules={[{ required: true, message: '请选择结案结论' }]}
                    >
                      <Select placeholder="请选择结案结论">
                        <Option value="pass">
                          <Space>
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            通过
                          </Space>
                        </Option>
                        <Option value="fraud">
                          <Space>
                            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                            欺诈确认
                          </Space>
                        </Option>
                        <Option value="false_positive">
                          <Space>
                            <WarningOutlined style={{ color: '#faad14' }} />
                            误报
                          </Space>
                        </Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      label="调查结论"
                      name="conclusion_note"
                      rules={[
                        { required: true, message: '请填写调查结论' },
                        { min: 20, message: '调查结论不少于20字' },
                      ]}
                    >
                      <TextArea
                        rows={4}
                        placeholder="请详细填写调查结论（不少于20字）"
                        showCount
                        maxLength={500}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        block
                        icon={<SendOutlined />}
                        loading={closeSubmitting}
                        onClick={handleCloseCase}
                      >
                        提交结案
                      </Button>
                    </Form.Item>
                  </Form>
                </Card>
              )}

              <Card
                size="small"
                title={
                  <Space>
                    <ClockCircleOutlined />
                    <span>调查备注</span>
                    <Tag color="blue">{caseData?.notes?.length || 0}</Tag>
                  </Space>
                }
              >
                {!isClosed && (
                  <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
                    <TextArea
                      rows={3}
                      placeholder="添加调查备注..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      maxLength={500}
                      showCount
                    />
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={handleAddNote}
                      loading={noteSubmitting}
                      disabled={!noteContent.trim()}
                    >
                      添加备注
                    </Button>
                  </Space>
                )}

                <Divider style={{ margin: '12px 0' }} />

                {caseData?.notes && caseData.notes.length > 0 ? (
                  <Timeline
                    mode="left"
                    items={[...caseData.notes]
                      .sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf())
                      .map((note) => ({
                        color: 'blue',
                        label: (
                          <div style={{ textAlign: 'left' }}>
                            <Text type="secondary">
                              {dayjs(note.created_at).format('YYYY-MM-DD HH:mm:ss')}
                            </Text>
                          </div>
                        ),
                        children: (
                          <div
                            style={{
                              padding: '8px 12px',
                              background: '#f6ffed',
                              border: '1px solid #b7eb8f',
                              borderRadius: 6,
                            }}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Text strong>
                                <UserOutlined /> {note.operator}
                              </Text>
                              <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                {note.content}
                              </Paragraph>
                            </Space>
                          </div>
                        ),
                      }))}
                  />
                ) : (
                  <Empty description="暂无调查备注" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Space>
          </Col>
        </Row>
      </Card>
    </Space>
  );
};

export default CaseDetail;
