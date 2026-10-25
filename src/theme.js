import { theme as antdTheme } from 'antd';
import React from 'react';

export const requiredMark = (label, { required }) => React.createElement(
  'span',
  { className: 'required-label' },
  label,
  required && React.createElement('span', { className: 'required-mark', 'aria-hidden': 'true' }, '*'),
);

const FONT = 'DM Sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const buildTheme = (dark) => ({
  algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#4667e8',
    colorInfo: '#4667e8',
    borderRadius: 12,
    fontFamily: FONT,
    colorBgLayout: dark ? '#111522' : '#f5f7fb',
    colorBgContainer: dark ? '#1a2030' : '#fff',
    colorText: dark ? '#edf0fb' : '#20243a',
    colorTextSecondary: dark ? '#a3abc0' : '#777f93',
    colorBorderSecondary: dark ? '#30374a' : '#e9ecf3',
    controlHeight: 42,
  },
});
