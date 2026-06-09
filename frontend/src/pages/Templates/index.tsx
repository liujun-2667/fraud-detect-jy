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
  Form,
  InputNumber,
  Switch,
  message,
  Row,
  Col,
  Descriptions,
  Typography,
  Divider,
  Popconfirm,
  Tooltip,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  PlayCircleOutlined,
  SearchOutlined,
  FireOutlined,
  CrownOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateStatus,
} from '../../api/templates';
import { RuleTemplate, TemplateCategory, RuleType, ThresholdRuleConfig } from '../../types';

const { Option } = Select;
const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const categoryMap: Record<TemplateCategory, { label: string; color: string }> = {
  amount: { label: '金额类', color: 'red' },
  frequency: { label: '频次类', color: 'orange' },
  geography: { label: '地域类', color: 'blue' },
  time: { label: '时段类', color: 'purple' },
  device: { label: '设备类', color: 'cyan' },
  behavior: { label: '行为类', color: 'green' },
};

const ruleTypeMap: Record<RuleType, { label: string; color: string }> = {
  threshold: { label: '阈值规则', color: 'blue' },
  association: { label: '关联规则', color: 'purple' },
  behavior: { label: '行为规则', color: 'cyan' },
};

interface AssociationCondition {
  field: string;
  operator: string;
  value: any;
}

const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [category, setCategory] = useState<TemplateCategory | undefined>();
  const [isActive, setIsActive] = useState<boolean | undefined>(true);
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'use_count' | 'created_at' | 'name'>('use_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RuleTemplate | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
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
    behavior_type: 'high_frequency',
    window_minutes: 60,
    threshold: 10,
    parameters: {},
  });

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getTemplates({
        page,
        page_size: pageSize,
        category,
        is_active: isActive,
        keyword,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (res.code === 0) {
        setTemplates(res.data?.items || []);
        setTotal(res.data?.total || 0);
      } else {
        message.error(res.message || '获取模板列表失败');
      }
    } catch (e: any) {
      message.error(e.message || '获取模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [page, pageSize, category, isActive, keyword, sortBy, sortOrder]);

  const resetConfigState = () => {
    setRuleType('threshold');
    setThresholdConfig({ field: 'amount', operator: '>', value: 10000 });
    setAssociationConditions([{ field: 'amount', operator: '>', value: 5000 }]);
    setMinMatchCount(2);
    setBehaviorConfig({
      behavior_type: 'high_frequency',
      window_minutes: 60,
      threshold: 10,
      parameters: {},
    });
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    resetConfigState();
    form.resetFields();
    form.setFieldsValue({
      rule_type: 'threshold',
      category: 'amount',
      default_weight: 5,
      default_priority: 100,
      default_is_immediate_block: false,
      is_active: true,
      tags: [],
    });
    setModalVisible(true);
  };

  const handleEdit = (template: RuleTemplate) => {
    setEditingTemplate(template);
    setRuleType(template.rule_type);
    if (template.config?.threshold) {
      setThresholdConfig(template.config.threshold);
    }
    if (template.config?.association) {
      setAssociationConditions(template.config.association.conditions || []);
      setMinMatchCount(template.config.association.min_match_count || 2);
    }
    if (template.config?.behavior) {
      setBehaviorConfig(template.config.behavior);
    }
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      category: template.category,
      applicable_scene: template.applicable_scene,
      rule_type: template.rule_type,
      default_weight: template.default_weight,
      default_priority: template.default_priority,
      default_is_immediate_block: template.default_is_immediate_block,
      is_active: template.is_active,
      tags: template.tags,
    });
    setModalVisible(true);
  };

  const handleToggle = async (template: RuleTemplate) => {
    try {
      const res = await toggleTemplateStatus(template.id);
      if (res.code === 0) {
        message.success(template.is_active ? '模板已停用' : '模板已启用');
        loadTemplates();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (e: any) {
      message.error(e.message || '操作失败');
    }
  };

  const handleDelete = async (template: RuleTemplate) => {
    try {
      const res = await deleteTemplate(template.id);
      if (res.code === 0) {
        message.success('模板已删除');
        loadTemplates();
      } else {
        message.error(res.message || '删除失败');
      }
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  const buildConfig = () => {
    let config: any = {};
    if (ruleType === 'threshold') {
      config.threshold = thresholdConfig;
    } else if (ruleType === 'association') {
      config.association = { conditions: associationConditions, min_match_count: minMatchCount };
    } else if (ruleType === 'behavior') {
      config.behavior = behaviorConfig;
    }
    return config;
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      const config = buildConfig();
      const payload = {
        ...values,
        rule_type: ruleType,
        config,
        default_logic_expression: {
          expression: { type: 'AND', conditions: [] },
        },
      };

      let res: any;
      if (editingTemplate) {
        res = await updateTemplate(editingTemplate.id, payload);
      } else {
        res = await createTemplate(payload);
      }

      if (res.code === 0) {
        message.success(editingTemplate ? '模板更新成功' : '模板创建成功');
        setModalVisible(false);
        loadTemplates();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message || '保存失败');
    } finally {
      setModalLoading(false);
    }
  };

  const getConfigSummary = (template: RuleTemplate) => {
    const cfg = template.config;
    if (cfg.threshold) {
      return `${cfg.threshold.field} ${cfg.threshold.operator} ${cfg.threshold.value}${cfg.threshold.unit ? ' ' + cfg.threshold.unit : ''}`;
    }
    if (cfg.association) {
      return `${cfg.association.conditions?.length || 0} 个关联条件，至少匹配 ${cfg.association.min_match_count || 0} 个`;
    }
    if (cfg.behavior) {
      return `${cfg.behavior.behavior_type}，窗口 ${cfg.behavior.window_minutes} 分钟，阈值 ${cfg.behavior.threshold}`;
    }
    return '自定义配置';
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

  const columns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string, record: RuleTemplate) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{text}</span>
          {record.is_builtin && (
            <Tooltip title="系统内置模板">
              <CrownOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: TemplateCategory) => (
        <Tag color={categoryMap[cat]?.color}>
          {categoryMap[cat]?.label || cat}
        </Tag>
      ),
    },
    {
      title: '规则类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 110,
      render: (type: RuleType) => (
        <Tag color={ruleTypeMap[type]?.color}>
          {ruleTypeMap[type]?.label || type}
        </Tag>
      ),
    },
    {
      title: '默认参数概要',
      key: 'config_summary',
      width: 240,
      render: (_: any, record: RuleTemplate) => (
        <Tooltip title={<pre style={{ margin: 0 }}>{JSON.stringify(record.config, null, 2)}</pre>}>
          <Text type="secondary">{getConfigSummary(record)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '权重/优先级',
      key: 'weight_priority',
      width: 120,
      render: (_: any, record: RuleTemplate) => (
        <Space direction="vertical" size={0}>
          <Text type="secondary">权重: {record.default_weight}</Text>
          <Text type="secondary">优先级: {record.default_priority}</Text>
        </Space>
      ),
    },
    {
      title: (
        <Space>
          <FireOutlined style={{ color: '#ff4d4f' }} />
          热度
        </Space>
      ),
      dataIndex: 'use_count',
      key: 'use_count',
      width: 90,
      sorter: true,
      render: (count: number) => (
        <Tag color={count > 0 ? 'red' : 'default'}>
          <FireOutlined /> {count}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>
          {active ? '已启用' : '已停用'}
        </Tag>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      render: (tags: string[]) => (
        <>
          {(tags || []).slice(0, 3).map((tag, idx) => (
            <Tag key={idx} color="blue">
              {tag}
            </Tag>
          ))}
          {tags && tags.length > 3 && <Tag>+{tags.length - 3}</Tag>}
        </>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: RuleTemplate) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Tooltip title={record.is_active ? '停用模板' : '启用模板'}>
            <Button
              size="small"
              icon={record.is_active ? <StopOutlined /> : <PlayCircleOutlined />}
              onClick={() => handleToggle(record)}
            >
              {record.is_active ? '停用' : '启用'}
            </Button>
          </Tooltip>
          {!record.is_builtin && (
            <Popconfirm
              title="确认删除此模板？"
              description="删除后不可恢复"
              onConfirm={() => handleDelete(record)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const renderThresholdConfig = () => (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label="字段" required>
          <Select
            value={thresholdConfig.field}
            onChange={(v) => setThresholdConfig({ ...thresholdConfig, field: v })}
          >
            <Option value="amount">交易金额 (amount)</Option>
            <Option value="daily_total">日累计金额 (daily_total)</Option>
            <Option value="frequency">交易频次 (frequency)</Option>
            <Option value="is_overseas">是否境外 (is_overseas)</Option>
            <Option value="is_high_risk_region">高风险地区 (is_high_risk_region)</Option>
            <Option value="is_new_device">新设备 (is_new_device)</Option>
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
  );

  const renderAssociationConfig = () => (
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
              <Option value="transaction_hour">交易时段</Option>
              <Option value="is_new_device">是否新设备</Option>
              <Option value="is_high_risk_region">高风险地区</Option>
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
  );

  const renderBehaviorConfig = () => (
    <Row gutter={24}>
      <Col span={8}>
        <Form.Item label="行为类型">
          <Select
            value={behaviorConfig.behavior_type}
            onChange={(v) => setBehaviorConfig({ ...behaviorConfig, behavior_type: v })}
          >
            <Option value="high_frequency">高频交易</Option>
            <Option value="geographic_jump">位置突变</Option>
            <Option value="amount_anomaly">金额突增</Option>
            <Option value="device_change">设备变更</Option>
            <Option value="merchant_risk">商户风险</Option>
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
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="模板库管理"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              新建模板
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="分类筛选"
            allowClear
            style={{ width: 140 }}
            value={category}
            onChange={(val) => {
              setCategory(val);
              setPage(1);
            }}
          >
            <Option value="amount">金额类</Option>
            <Option value="frequency">频次类</Option>
            <Option value="geography">地域类</Option>
            <Option value="time">时段类</Option>
            <Option value="device">设备类</Option>
            <Option value="behavior">行为类</Option>
          </Select>
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={isActive === undefined ? undefined : String(isActive)}
            onChange={(val) => {
              if (val === undefined) {
                setIsActive(undefined);
              } else {
                setIsActive(val === 'true');
              }
              setPage(1);
            }}
          >
            <Option value="true">已启用</Option>
            <Option value="false">已停用</Option>
          </Select>
          <Input
            placeholder="搜索模板名称/描述"
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => setPage(1)}
          />
          <Segmented
            value={sortBy}
            onChange={(val) => setSortBy(val as any)}
            options={[
              { label: '按热度', value: 'use_count' },
              { label: '按时间', value: 'created_at' },
              { label: '按名称', value: 'name' },
            ]}
          />
          <Segmented
            value={sortOrder}
            onChange={(val) => setSortOrder(val as any)}
            options={[
              { label: '降序', value: 'desc' },
              { label: '升序', value: 'asc' },
            ]}
          />
        </Space>

        <Table
          loading={loading}
          dataSource={templates}
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

      <Modal
        title={editingTemplate ? '编辑模板' : '新建模板'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleModalOk}
        confirmLoading={modalLoading}
        width={900}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="模板名称"
                name="name"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="如：大额单笔拦截" maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="分类"
                name="category"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select placeholder="请选择分类">
                  <Option value="amount">金额类</Option>
                  <Option value="frequency">频次类</Option>
                  <Option value="geography">地域类</Option>
                  <Option value="time">时段类</Option>
                  <Option value="device">设备类</Option>
                  <Option value="behavior">行为类</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="规则类型"
                name="rule_type"
                rules={[{ required: true, message: '请选择规则类型' }]}
              >
                <Select
                  placeholder="请选择规则类型"
                  onChange={(v: RuleType) => setRuleType(v)}
                >
                  <Option value="threshold">阈值规则</Option>
                  <Option value="association">关联规则</Option>
                  <Option value="behavior">行为规则</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="标签" name="tags">
                <Select
                  mode="tags"
                  placeholder="输入标签后回车添加"
                  style={{ width: '100%' }}
                  tokenSeparators={[',']}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="模板描述" name="description">
            <TextArea rows={2} placeholder="简要描述模板功能" maxLength={500} />
          </Form.Item>
          <Form.Item
            label="适用场景"
            name="applicable_scene"
          >
            <TextArea rows={2} placeholder="描述该模板适用的业务场景" maxLength={500} />
          </Form.Item>

          <Divider orientation="left">默认参数配置</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="默认权重"
                name="default_weight"
                rules={[{ required: true, message: '请输入权重' }]}
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="默认优先级"
                name="default_priority"
                rules={[{ required: true, message: '请输入优先级' }]}
              >
                <InputNumber min={1} max={999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="立即拦截"
                name="default_is_immediate_block"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">
            <Space>
              规则配置
              <Tooltip title="配置模板的默认规则参数">
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          </Divider>

          {ruleType === 'threshold' && renderThresholdConfig()}
          {ruleType === 'association' && renderAssociationConfig()}
          {ruleType === 'behavior' && renderBehaviorConfig()}

          <Divider orientation="left" style={{ marginTop: 24 }} />

          <Form.Item
            label="是否启用"
            name="is_active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default Templates;
