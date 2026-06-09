import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import RuleEditor from './pages/Rules/RuleEditor';
import Templates from './pages/Templates';
import Transactions from './pages/Transactions';
import Alerts from './pages/Alerts';
import Sandbox from './pages/Sandbox';
import CasesList from './pages/Cases';
import CaseDetail from './pages/Cases/CaseDetail';
import { useWebSocket } from './hooks/useWebSocket';

const App: React.FC = () => {
  useWebSocket();

  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="rules" element={<Rules />} />
            <Route path="rules/new" element={<RuleEditor />} />
            <Route path="rules/:id/edit" element={<RuleEditor />} />
            <Route path="templates" element={<Templates />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="cases" element={<CasesList />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="sandbox" element={<Sandbox />} />
          </Route>
        </Routes>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
