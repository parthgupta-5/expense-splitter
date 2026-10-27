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
    colorPrimary: dark ? '#f2f2f2' : '#111111',
    colorInfo: dark ? '#f2f2f2' : '#111111',
    colorLink: dark ? '#f2f2f2' : '#111111',
    colorSuccess: dark ? '#8fd97a' : '#237804',
    colorSuccessBg: dark ? '#1c261b' : '#eef7ea',
    colorInfoBg: dark ? '#222222' : '#f0f0f0',
    colorInfoBorder: dark ? '#2e2e2e' : '#e3e3e3',
    colorWarning: dark ? '#bdbdbd' : '#444444',
    colorWarningBg: dark ? '#222222' : '#f0f0f0',
    colorWarningBorder: dark ? '#2e2e2e' : '#e3e3e3',
    colorTextLightSolid: dark ? '#111111' : '#ffffff',
    borderRadius: 12,
    fontFamily: FONT,
    colorBgLayout: dark ? '#0d0d0d' : '#f7f7f7',
    colorBgContainer: dark ? '#161616' : '#ffffff',
    colorText: dark ? '#f2f2f2' : '#111111',
    colorTextSecondary: dark ? '#a3a3a3' : '#5f5f5f',
    colorBorderSecondary: dark ? '#2e2e2e' : '#e3e3e3',
    controlHeight: 42,
  },
});
