import React from 'react';
import {
  Button, Card, Select, Space, Typography, Upload,
} from 'antd';
import {
  DownloadOutlined, MoonOutlined, SunOutlined, UploadOutlined,
} from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import AccountSettings from '../components/AccountSettings';
import PageIntro from '../components/PageIntro';
import { parseBackupText, portableGroup } from '../lib/backup';
import { CURRENCIES, DEFAULT_CURRENCY } from '../lib/currency';
import { downloadText } from '../lib/download';

const { Text } = Typography;

const Setting = ({ title, description, children }) => (
  <Card className="setting-card">
    <div className="setting-copy">
      <Text strong>{title}</Text>
      {description && <Text type="secondary">{description}</Text>}
    </div>
    {children}
  </Card>
);

export default function SettingsPage() {
  const {
    workspace, notify, modal, dark, toggleDark, openAuth,
  } = useApp();
  const { actions } = workspace;
  const cloud = workspace.mode === 'cloud';

  const exportBackup = () => {
    const backup = {
      // Cents fields for this version plus the decimal fields v2.0 reads, so either version can import the file.
      groups: workspace.groups.map(({
        ownerId: _o, role: _r, memberCount: _m, cloud: _c, ...group
      }) => portableGroup(group)),
      savedPeople: workspace.savedPeople,
      preferences: workspace.preferences,
      exportedAt: new Date().toISOString(),
    };
    downloadText('expense-splitter-backup.json', 'application/json', JSON.stringify(backup, null, 2));
    notify.success('Backup downloaded');
  };

  const importBackup = async (file) => {
    try {
      const backup = parseBackupText(await file.text(), file.size);
      modal.confirm({
        title: 'Import this backup?',
        content: cloud
          ? `${backup.groups.length} group(s) will be added to your account as new groups.`
          : `${backup.groups.length} group(s) will be added to this device. Groups with matching IDs will use the imported copy.`
            + (backup.skipped ? ` ${backup.skipped} damaged item(s) in the file will be skipped.` : ''),
        okText: 'Import backup',
        onOk: async () => {
          const { imported, failed } = await actions.importGroups(backup.groups);
          if (backup.savedPeople.length) {
            actions.setSavedPeople((current) => [...new Set([...current, ...backup.savedPeople])]);
          }
          if (backup.preferences.currency) actions.setPreferences({ currency: backup.preferences.currency });
          if (imported.length) notify.success(`${imported.length} group(s) imported`);
          if (failed.length) notify.error('Could not import: ' + failed.map((item) => item.group.name).join(', '));
        },
      });
    } catch (error) {
      notify.error(error.message || 'Could not read this backup file.');
    }
    return false;
  };

  return (
    <>
      <PageIntro title="Settings" />
      <section className="page-panel settings-panel">
        {cloud && <AccountSettings />}
        <Setting title="Default currency" description="Used for new groups. Each group can have its own currency.">
          <Select
            value={workspace.preferences.currency || DEFAULT_CURRENCY}
            options={CURRENCIES}
            onChange={(currency) => actions.setPreferences({ currency })}
            aria-label="Default currency"
          />
        </Setting>
        <Setting title="Appearance">
          <Button icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleDark}>
            {dark ? 'Switch to light' : 'Switch to dark'}
          </Button>
        </Setting>
        <Setting title="Back up your data" description="A JSON file you can import again later, here or on another device.">
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={exportBackup}>Download backup</Button>
            <Upload accept="application/json,.json" showUploadList={false} beforeUpload={importBackup}>
              <Button icon={<UploadOutlined />}>Import backup</Button>
            </Upload>
          </Space>
        </Setting>
        {!cloud && (
          <Setting title="Account" description="Sign in to sync across devices and share groups.">
            <Button onClick={() => openAuth('signup')}>Sign in or create account</Button>
          </Setting>
        )}
      </section>
    </>
  );
}
