import React from 'react';
import { Avatar, Badge, Button, Layout, Space, Tooltip } from 'antd';
import {
  AppstoreOutlined, BarChartOutlined, HistoryOutlined, MoonOutlined, SettingOutlined,
  SunOutlined, TeamOutlined, UserOutlined, WalletOutlined,
} from '@ant-design/icons';
import { isHttpsUrl } from '../lib/url';

const { Header } = Layout;

export default function TopBar({ page, onNavigate, counts, dark, onToggleDark, user, profile }) {
  const navItems = [
    { key: 'dashboard', label: 'Overview', icon: <BarChartOutlined /> },
    { key: 'groups', label: 'Groups', icon: <AppstoreOutlined />, count: counts.groups },
    { key: 'history', label: 'History', icon: <HistoryOutlined />, count: counts.history },
    { key: 'people', label: 'People', icon: <TeamOutlined />, count: counts.people },
    { key: 'settings', label: 'Settings', icon: <SettingOutlined /> },
  ];
  const avatarSrc = isHttpsUrl(profile?.avatar_url)
    ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
    : undefined;

  return (
    <Header className="topbar">
      <div className="topbar-inner">
        <a href="#top" className="brand" onClick={(event) => { event.preventDefault(); onNavigate('dashboard'); }}>
          <span className="brand-mark"><WalletOutlined /></span>
          <span>Expense <span className="brand-accent">Splitter</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Button
              key={item.key}
              type={page === item.key ? 'primary' : 'text'}
              icon={item.icon}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
              {item.count !== undefined && <span className="nav-count">{item.count}</span>}
            </Button>
          ))}
        </nav>
        <Space size={8}>
          <Tooltip title={dark ? 'Switch to light appearance' : 'Switch to dark appearance'}>
            <Button
              shape="circle"
              type="text"
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={onToggleDark}
              aria-label="Toggle appearance"
            />
          </Tooltip>
          <Button className="account-button" type="text" onClick={() => onNavigate('profile')}>
            <Badge dot={Boolean(user)} color="#43a87a">
              <Avatar size="small" src={avatarSrc} icon={<UserOutlined />} />
            </Badge>
            <span className="account-label">{profile?.display_name || 'Account'}</span>
          </Button>
        </Space>
      </div>
    </Header>
  );
}
