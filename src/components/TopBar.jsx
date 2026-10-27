import React from 'react';
import { Link, useLocation } from 'react-router';
import { Avatar, Badge, Button, Layout, Space, Tooltip } from 'antd';
import {
  AppstoreOutlined, BarChartOutlined, HistoryOutlined, MoonOutlined, SettingOutlined,
  SunOutlined, TeamOutlined, UserOutlined, WalletOutlined,
} from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import { isHttpsUrl } from '../lib/url';
import { readLastGroup } from '../lib/storage';

const { Header } = Layout;

export default function TopBar() {
  const { workspace, auth, dark, toggleDark } = useApp();
  const { pathname } = useLocation();
  const { groups, savedPeople, profile } = workspace;
  const lastGroup = groups.find((group) => group.id === readLastGroup()) || groups[0];

  const navItems = [
    {
      to: lastGroup ? '/groups/' + lastGroup.id : '/groups',
      label: 'Overview',
      icon: <BarChartOutlined />,
      active: /^\/groups\/[^/]+/.test(pathname),
    },
    { to: '/groups', label: 'Groups', icon: <AppstoreOutlined />, count: groups.length, active: pathname === '/groups' },
    { to: '/history', label: 'History', icon: <HistoryOutlined />, active: pathname === '/history' },
    { to: '/people', label: 'People', icon: <TeamOutlined />, count: savedPeople.length, active: pathname === '/people' },
    { to: '/settings', label: 'Settings', icon: <SettingOutlined />, active: pathname === '/settings' },
  ];
  const avatarSrc = isHttpsUrl(profile?.avatar_url)
    ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
    : undefined;

  return (
    <Header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="Expense Splitter home">
          <span className="brand-mark"><WalletOutlined /></span>
          <span>Expense <span className="brand-accent">Splitter</span></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={'nav-link' + (item.active ? ' is-active' : '')}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && <span className="nav-count">{item.count}</span>}
            </Link>
          ))}
        </nav>
        <Space size={8}>
          <Tooltip title={dark ? 'Switch to light appearance' : 'Switch to dark appearance'}>
            <Button
              shape="circle"
              type="text"
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleDark}
              aria-label="Toggle appearance"
            />
          </Tooltip>
          <Link
            to="/profile"
            className={'nav-link account-link' + (pathname === '/profile' ? ' is-active' : '')}
            aria-label={auth.user ? 'Account' : 'Sign in'}
          >
            <Badge dot={Boolean(auth.user)} color="#43a87a">
              <Avatar size="small" src={avatarSrc} icon={<UserOutlined />} />
            </Badge>
            <span className="account-label">{profile?.display_name || (auth.user ? 'Account' : 'Sign in')}</span>
          </Link>
        </Space>
      </div>
    </Header>
  );
}
