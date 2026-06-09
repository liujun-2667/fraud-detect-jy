import React, { useState, useEffect } from 'react';
import {
  Modal,
  Card,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Row,
  Col,
  Typography,
  Spin,
  Empty,
  Tooltip,
  Badge,
  Segmented,
} from 'antd';
import {
  SearchOutlined,
  FireOutlined,
  CrownOutlined,
  CheckOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  getTemplates,
} from '../../api/templates';
import { RuleTemplate, TemplateCategory, RuleType, ThresholdRuleConfig } from '../../types';

const { Option } = Select;
const { Text, Paragraph, Title } = Typography;

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

export interface TemplateFilledData {
  templateId: number;
  templateName: string;
  ruleType: RuleType;
  config: {
    threshold?: ThresholdRuleConfig;
    association?: any;
    behavior?: any;
  };
  weight: number;
  priority: number;
  isImmediateBlock: boolean;
  logicExpression: any;
  description?: string;
}

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (data: TemplateFilledData) => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ open, onClose, onSelect }) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<TemplateCategory | undefined>();
  const [sortBy, setSortBy] = useState<'use_count' | 'created_at'>('use_count');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getTemplates({
        page: 1,
        page_size: 100,
        is_active: true,
        category,
        keyword,
        sort_by: sortBy,
        sort_order: 'desc',
      });
      if (res.code === 0) {
        setTemplates(res.data?.items || []);
      }
    } catch (e: any) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open, category, keyword, sortBy]);

  const handleSelectTemplate = (template: RuleTemplate) => {
    setSelectedId(template.id);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    const template = templates.find((t) => t.id === selectedId);
    if (!template) return;

    onSelect({
      templateId: template.id,
      templateName: template.name,
      ruleType: template.rule_type,
      config: template.config,
      weight: template.default_weight,
      priority: template.default_priority,
      isImmediateBlock: template.default_is_immediate_block,
      logicExpression: template.default_logic_expression,
      description: template.description,
    });
    onClose();
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

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>选择模板</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckOutlined />}
          disabled={!selectedId}
          onClick={handleConfirm}
        >
          使用此模板
        </Button>,
      ]}
      bodyStyle={{ maxHeight: 640, overflowY: 'auto' }}
    >
      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <Select
          placeholder="分类筛选"
          allowClear
          style={{ width: 140 }}
          value={category}
          onChange={(val) => setCategory(val)}
        >
          <Option value="amount">金额类</Option>
          <Option value="frequency">频次类</Option>
          <Option value="geography">地域类</Option>
          <Option value="time">时段类</Option>
          <Option value="device">设备类</Option>
          <Option value="behavior">行为类</Option>
        </Select>
        <Input
          placeholder="搜索模板名称/描述"
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Segmented
          value={sortBy}
          onChange={(val) => setSortBy(val as any)}
          options={[
            { label: '热度优先', value: 'use_count' },
            { label: '最新优先', value: 'created_at' },
          ]}
        />
      </Space>

      <Spin spinning={loading}>
        {templates.length === 0 && !loading ? (
          <Empty description="暂无可用模板" style={{ padding: 40 }} />
        ) : (
          <Row gutter={[16, 16]}>
            {templates.map((template) => (
              <Col span={12} key={template.id}>
                <Card
                  hoverable
                  onClick={() => handleSelectTemplate(template)}
                  style={{
                    cursor: 'pointer',
                    border: selectedId === template.id ? '2px solid #1677ff' : '1px solid #f0f0f0',
                    background: selectedId === template.id ? '#f0f7ff' : '#fff',
                    height: '100%',
                    transition: 'all 0.2s',
                  }}
                  bodyStyle={{ padding: 16 }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Title level={5} style={{ margin: 0 }}>
                        <Space size={4}>
                          {template.is_builtin && (
                            <Tooltip title="系统内置模板">
                              <CrownOutlined style={{ color: '#faad14' }} />
                            </Tooltip>
                          )}
                          {template.name}
                        </Space>
                      </Title>
                      <Badge
                        count={<><FireOutlined /> {template.use_count}</>}
                        showZero
                        style={{
                          backgroundColor: template.use_count > 0 ? '#ff4d4f' : '#d9d9d9',
                        }}
                      />
                    </Space>

                    <Space wrap>
                      <Tag color={categoryMap[template.category]?.color}>
                        {categoryMap[template.category]?.label}
                      </Tag>
                      <Tag color={ruleTypeMap[template.rule_type]?.color}>
                        {ruleTypeMap[template.rule_type]?.label}
                      </Tag>
                      {template.default_is_immediate_block && (
                        <Tag color="red">立即拦截</Tag>
                      )}
                    </Space>

                    {template.description && (
                      <Paragraph type="secondary" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                        {template.description}
                      </Paragraph>
                    )}

                    {template.applicable_scene && (
                      <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                        <Text strong>适用场景：</Text>
                        {template.applicable_scene}
                      </Paragraph>
                    )}

                    <Space direction="vertical" size={4} style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        默认参数：{getConfigSummary(template)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        权重: {template.default_weight} · 优先级: {template.default_priority}
                      </Text>
                    </Space>

                    <Space wrap style={{ marginTop: 4 }}>
                      {(template.tags || []).slice(0, 3).map((tag, idx) => (
                        <Tag key={idx} color="blue" style={{ fontSize: 11, margin: 0 }}>
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>
    </Modal>
  );
};

export default TemplateSelector;
