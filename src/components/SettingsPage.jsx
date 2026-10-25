import React from 'react';
import { Button, Card, Select, Space, Tag, Typography, Upload } from 'antd';
import { DownloadOutlined, MoonOutlined, SunOutlined, UploadOutlined } from '@ant-design/icons';
import { CURRENCIES } from '../lib/currency';

const { Text } = Typography;

const Setting = ({ title, children }) => (
  <Card className="setting-card">
    <div className="setting-copy"><Text strong>{title}</Text></div>
    {children}
  </Card>
);

export default function SettingsPage({
  currencyCode, onCurrency, dark, onToggleDark, onExportBackup, onImportBackup, user, onSignIn,
}) {
  return (
    <section className="page-panel settings-panel">
      <Setting title="Currency">
        <Select value={currencyCode} options={CURRENCIES} onChange={onCurrency} />
      </Setting>
      <Setting title="Appearance">
        <Button icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={onToggleDark}>
          {dark ? 'Switch to light' : 'Switch to dark'}
        </Button>
      </Setting>
      <Setting title="Back up your data">
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={onExportBackup}>Download backup</Button>
          <Upload accept="application/json,.json" showUploadList={false} beforeUpload={onImportBackup}>
            <Button icon={<UploadOutlined />}>Import backup</Button>
          </Upload>
        </Space>
      </Setting>
      <Setting title="Account sync">
        {user
          ? <Tag color="green">Cloud sync enabled</Tag>
          : <Button onClick={onSignIn}>Sign in or create account</Button>}
      </Setting>
    </section>
  );
}
