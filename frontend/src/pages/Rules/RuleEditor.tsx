import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  Slider,
  Switch,
  Button,
  Space,
  Breadcrumb,
  Row,
  Col,
  Divider,
  message,
  Spin,
  Modal,
  List,
  Tag,
  Tooltip,
  Typography,
  Descriptions,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getRuleById, createRule, modifyActiveRule } from '../../api/rules';
import { evaluateTransaction } from '../../api/transactions';
import { Rule, RuleType, Evaluation, ThresholdRuleConfig } from '../../types';

const { Option } = Select;
const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface AssociationCondition {
  field: string;
  operator: string;
  value: any;
}

interface LogicNode {
  id: string;
  type: 'AND' | 'OR' | 'NOT' | 'condition';
  children?: LogicNode[];
  condition?: {
    field: string;
    operator: string;
    value: any;
  };
}

const genNodeId = () => Math.random().toString(36).substring(2, 10);

const RuleEditor: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [_rule, setRule] = useState<Rule | null>(null);
  const [testResult, setTestResult] = useState<Evaluation | null>(null);
  const [testModalVisible, setTestModalVisible] = useState(false);

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
  const [isImmediateBlock, setIsImmediateBlock] = useState<boolean>(false);
  const [logicTree, setLogicTree] = useState<LogicNode>({
    id: genNodeId(),
    type: 'AND',
    children: [
      {
        id: genNodeId(),
        type: 'condition',
        condition: { field: 'amount', operator: '>', value: 1000 },
      },
    ],
  });

  const loadRule = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getRuleById(Number(id));
      if (res.code === 0) {
        const r = res.data;
        setRule(r);
        form.setFieldsValue({
          name: r.name,
          description: r.description,
          rule_type: r.rule_type,
        });
        setRuleType(r.rule_type);
        const latest = r.versions?.[0];
        if (latest) {
          setWeight(latest.weight);
          setPriority(latest.priority);
          setIsImmediateBlock(latest.is_immediate_block);
          if (latest.config?.threshold) {
            setThresholdConfig(latest.config.threshold);
          }
          if (latest.config?.association) {
            setAssociationConditions(latest.config.association.conditions || []);
            setMinMatchCount(latest.config.association.min_match_count || 2);
          }
          if (latest.config?.behavior) {
            setBehaviorConfig(latest.config.behavior);
          }
          if (latest.logic_expression) {
            setLogicTree(latest.logic_expression);
          }
        }
      } else {
        message.error(res.message || '获取规则详情失败');
      }
    } catch (e: any) {
      message.error(e.message || '获取规则详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isEdit) {
      loadRule();
    }
  }, [id]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      let config: any = {};
      if (ruleType === 'threshold') {
        config.threshold = thresholdConfig;
      } else if (ruleType === 'association') {
        config.association = { conditions: associationConditions, min_match_count: minMatchCount };
      } else if (ruleType === 'behavior') {
        config.behavior = behaviorConfig;
      }

      const payload = {
        name: values.name,
        description: values.description,
        rule_type: ruleType,
        config,
        weight,
        priority,
        is_immediate_block: isImmediateBlock,
        logic_expression: logicTree,
      };

      let res: any;
      if (isEdit) {
        res = await modifyActiveRule(Number(id), payload);
      } else {
        res = await createRule(payload);
      }

      if (res.code === 0) {
        message.success(isEdit ? '规则已更新，已生成新版本' : '规则创建成功');
        navigate('/rules');
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let config: any = {};
      if (ruleType === 'threshold') {
        config.threshold = thresholdConfig;
      } else if (ruleType === 'association') {
        config.association = { conditions: associationConditions, min_match_count: minMatchCount };
      } else if (ruleType === 'behavior') {
        config.behavior = behaviorConfig;
      }

      const res = await evaluateTransaction({
        transaction_no: `TEST_${Date.now()}`,
        card_no: '6222****1234',
        card_hash: 'test_card_hash',
        amount: 50000,
        merchant_id: 'M001',
        merchant_name: '测试商户',
        region: '北京',
        region_code: 'BJ',
        is_overseas: false,
        transaction_time: new Date().toISOString(),
        test_rule_config: {
          rule_type: ruleType,
          config,
          weight,
          priority,
          is_immediate_block: isImmediateBlock,
          logic_expression: logicTree,
        },
      });

      if (res.code === 0) {
        setTestResult(res.data);
        setTestModalVisible(true);
      } else {
        message.error(res.message || '测试失败');
      }
    } catch (e: any) {
      message.error(e.message || '测试失败');
    } finally {
      setTesting(false);
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
      setAssociationConditions(associationConditions.filter((_item, i) => i !== index));
    }
  };

  const addLogicChild = (parentId: string, nodeType: LogicNode['type']) => {
    const newNode: LogicNode =
      nodeType === 'condition'
        ? {
            id: genNodeId(),
            type: 'condition',
            condition: { field: 'amount', operator: '>', value: 1000 },
          }
        : {
            id: genNodeId(),
            type: nodeType,
            children:
              nodeType === 'NOT'
                ? [
                    {
                      id: genNodeId(),
                      type: 'condition',
                      condition: { field: 'amount', operator: '>', value: 1000 },
                    },
                  ]
                : [
                    {
                      id: genNodeId(),
                      type: 'condition',
                      condition: { field: 'amount', operator: '>', value: 1000 },
                    },
                    {
                      id: genNodeId(),
                      type: 'condition',
                      condition: { field: 'amount', operator: '<', value: 10000 },
                    },
                  ],
          };

    const addToTree = (node: LogicNode): LogicNode => {
      if (node.id === parentId) {
        return { ...node, children: [...(node.children || []), newNode] };
      }
      if (node.children) {
        return { ...node, children: node.children.map(addToTree) };
      }
      return node;
    };
    setLogicTree(addToTree(logicTree));
  };

  const removeLogicNode = (nodeId: string) => {
    const removeFromTree = (node: LogicNode): LogicNode | null => {
      if (node.id === nodeId) return null;
      if (node.children) {
        const newChildren = node.children
          .map(removeFromTree)
          .filter((n): n is LogicNode => n !== null);
        return { ...node, children: newChildren };
      }
      return node;
    };
    const result = removeFromTree(logicTree);
    if (result) setLogicTree(result);
  };

  const updateLogicCondition = (nodeId: string, key: string, value: any) => {
    const updateInTree = (node: LogicNode): LogicNode => {
      if (node.id === nodeId && node.condition) {
        return { ...node, condition: { ...node.condition, [key]: value } };
      }
      if (node.children) {
        return { ...node, children: node.children.map(updateInTree) };
      }
      return node;
    };
    setLogicTree(updateInTree(logicTree));
  };

  const renderLogicNode = (node: LogicNode, level: number = 0): React.ReactNode => {
    const isCondition = node.type === 'condition';

    return (
      <div key={node.id} style={{ marginLeft: level > 0 ? 24 : 0, marginBottom: 8 }}>
        <Card size="small" style={{ display: 'inline-block', minWidth: 300 }}>
          <Space>
            {!isCondition && (
              <Tag color={node.type === 'AND' ? 'blue' : node.type === 'OR' ? 'green' : 'orange'}>
                {node.type}
              </Tag>
            )}
            {isCondition && (
              <>
                <Select
                  size="small"
                  value={node.condition?.field}
                  style={{ width: 100 }}
                  onChange={(v) => updateLogicCondition(node.id, 'field', v)}
                >
                  <Option value="amount">金额</Option>
                  <Option value="daily_total">日累计</Option>
                  <Option value="frequency">频次</Option>
                  <Option value="region">地域</Option>
                </Select>
                <Select
                  size="small"
                  value={node.condition?.operator}
                  style={{ width: 70 }}
                  onChange={(v) => updateLogicCondition(node.id, 'operator', v)}
                >
                  <Option value=">">{'>'}</Option>
                  <Option value=">=">{'>='}</Option>
                  <Option value="<">{'<'}</Option>
                  <Option value="<=">{'<='}</Option>
                  <Option value="==">{'=='}</Option>
                  <Option value="!=">{'!='}</Option>
                </Select>
                <InputNumber
                  size="small"
                  value={node.condition?.value}
                  style={{ width: 100 }}
                  onChange={(v) => updateLogicCondition(node.id, 'value', v)}
                />
              </>
            )}
            {!isCondition && (
              <>
                <Tooltip title="添加条件">
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => addLogicChild(node.id, 'condition')}
                  />
                </Tooltip>
                {node.type !== 'NOT' && (
                  <Tooltip title="添加AND组">
                    <Button size="small" onClick={() => addLogicChild(node.id, 'AND')}>
                      +AND
                    </Button>
                  </Tooltip>
                )}
                {node.type !== 'NOT' && (
                  <Tooltip title="添加OR组">
                    <Button size="small" onClick={() => addLogicChild(node.id, 'OR')}>
                      +OR
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="添加NOT组">
                  <Button size="small" onClick={() => addLogicChild(node.id, 'NOT')}>
                    +NOT
                  </Button>
                </Tooltip>
              </>
            )}
            {level > 0 && (
              <Tooltip title="删除">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeLogicNode(node.id)}
                />
              </Tooltip>
            )}
          </Space>
        </Card>
        {node.children && (
          <div style={{ marginTop: 8 }}>
            {node.children.map((child) => renderLogicNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const decisionColorMap: Record<string, string> = {
    block: 'red',
    review: 'orange',
    allow: 'green',
  };

  const decisionTextMap: Record<string, string> = {
    block: '拦截',
    review: '待审核',
    allow: '通过',
  };

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Breadcrumb
          items={[
            { title: '规则管理', onClick: () => navigate('/rules') },
            { title: isEdit ? '编辑规则' : '新建规则' },
          ]}
        />

        <Card
          title={isEdit ? '编辑规则' : '新建规则'}
          extra={
            <Space>
              <Button
                icon={<PlayCircleOutlined />}
                onClick={handleTest}
                loading={testing}
              >
                测试
              </Button>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/rules')}>
                返回
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                {isEdit ? '保存为新版本' : '创建草稿'}
              </Button>
            </Space>
          }
        >
          <Form form={form} layout="vertical">
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  label="规则名称"
                  name="name"
                  rules={[{ required: true, message: '请输入规则名称' }]}
                >
                  <Input placeholder="请输入规则名称" maxLength={100} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="规则类型"
                  name="rule_type"
                  rules={[{ required: true, message: '请选择规则类型' }]}
                  initialValue="threshold"
                >
                  <Select
                    placeholder="请选择规则类型"
                    onChange={(v) => setRuleType(v)}
                  >
                    <Option value="threshold">阈值规则</Option>
                    <Option value="association">关联规则</Option>
                    <Option value="behavior">行为规则</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="规则描述" name="description">
              <TextArea rows={2} placeholder="请输入规则描述（可选）" maxLength={500} />
            </Form.Item>

            <Divider orientation="left">规则配置</Divider>

            {ruleType === 'threshold' && (
              <Row gutter={24}>
                <Col span={8}>
                  <Form.Item label="字段" required>
                    <Select
                      value={thresholdConfig.field}
                      onChange={(v) => setThresholdConfig({ ...thresholdConfig, field: v })}
                    >
                      <Option value="amount">交易金额 (amount)</Option>
                      <Option value="daily_total">日累计金额 (daily_total)</Option>
                      <Option value="frequency">交易频次 (frequency)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="操作符" required>
                    <Select
                      value={thresholdConfig.operator}
                      onChange={(v) => setThresholdConfig({ ...thresholdConfig, operator: v })}
                    >
                      <Option value=">">{'>'} 大于</Option>
                      <Option value=">=">{'>='} 大于等于</Option>
                      <Option value="<">{'<'} 小于</Option>
                      <Option value="<=">{'<='} 小于等于</Option>
                      <Option value="==">{'=='} 等于</Option>
                      <Option value="!=">{'!='} 不等于</Option>
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
            )}

            {ruleType === 'association' && (
              <div>
                <Row gutter={24} style={{ marginBottom: 16 }}>
                  <Col span={12}>
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
                  </Col>
                </Row>
                {associationConditions.map((cond, idx) => (
                  <Row key={idx} gutter={12} style={{ marginBottom: 12 }} align="middle">
                    <Col span={1} style={{ textAlign: 'center' }}>
                      <Tag>{idx + 1}</Tag>
                    </Col>
                    <Col span={7}>
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
                    <Col span={5}>
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
                    <Col span={8}>
                      <InputNumber
                        style={{ width: '100%' }}
                        value={cond.value}
                        onChange={(v) => updateAssociationCondition(idx, 'value', v)}
                      />
                    </Col>
                    <Col span={3}>
                      <Button
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => removeAssociationCondition(idx)}
                        disabled={associationConditions.length <= 1}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addAssociationCondition}>
                  添加条件
                </Button>
              </div>
            )}

            {ruleType === 'behavior' && (
              <Row gutter={24}>
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
                  <Form.Item label="时间窗口（分钟）">
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
            )}

            <Divider orientation="left">评分参数</Divider>

            <Row gutter={24}>
              <Col span={12}>
                <Form.Item label={`权重（当前值: ${weight}）`}>
                  <Slider
                    min={1}
                    max={10}
                    value={weight}
                    onChange={setWeight}
                    marks={{
                      1: '1',
                      5: '5',
                      10: '10',
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="优先级">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    max={100}
                    value={priority}
                    onChange={(v) => setPriority(v ?? 5)}
                  />
                  <Text type="secondary">数值越小优先级越高（1-100）</Text>
                </Form.Item>
              </Col>
            </Row>

            <Row>
              <Col span={24}>
                <Form.Item label="立即拦截">
                  <Switch
                    checked={isImmediateBlock}
                    onChange={setIsImmediateBlock}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                  />
                  <Text type="secondary" style={{ marginLeft: 12 }}>
                    开启后，该规则命中将直接触发拦截，无需累计评分
                  </Text>
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left">逻辑表达式（可选）</Divider>
            <Paragraph type="secondary">
              支持 AND/OR/NOT 嵌套组合，构建复杂的逻辑条件。如无需自定义逻辑，可使用默认配置。
            </Paragraph>
            {renderLogicNode(logicTree)}
          </Form>
        </Card>

        <Modal
          title="规则测试结果"
          open={testModalVisible}
          onCancel={() => setTestModalVisible(false)}
          width={700}
          footer={[
            <Button key="close" onClick={() => setTestModalVisible(false)}>
              关闭
            </Button>,
          ]}
        >
          {testResult && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="风险评分">{testResult.risk_score}</Descriptions.Item>
                <Descriptions.Item label="决策结果">
                  <Tag color={decisionColorMap[testResult.decision]}>
                    {decisionTextMap[testResult.decision]}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="执行耗时">
                  {testResult.execution_ms} ms
                </Descriptions.Item>
                <Descriptions.Item label="评估时间">
                  {new Date(testResult.created_at).toLocaleString()}
                </Descriptions.Item>
              </Descriptions>

              <Divider orientation="left" style={{ margin: '12px 0' }}>
                命中规则明细
              </Divider>
              <List
                size="small"
                bordered
                dataSource={testResult.rule_hits || []}
                renderItem={(hit) => (
                  <List.Item>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                      <Space>
                        <Tag color={hit.is_hit ? 'red' : 'default'}>
                          {hit.is_hit ? '命中' : '未命中'}
                        </Tag>
                        <Text strong>{hit.rule_name}</Text>
                      </Space>
                      <Space>
                        <Text type="secondary">权重: {hit.weight}</Text>
                        <Text type="secondary">得分: {hit.score}</Text>
                      </Space>
                    </div>
                  </List.Item>
                )}
              />
            </Space>
          )}
        </Modal>
      </Space>
    </Spin>
  );
};

export default RuleEditor;
