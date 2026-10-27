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

const GROUP_FONT = '"Albert Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Ant Design tokens for the group page, so the dialogs it still borrows (members, settings) match its palette. */
export const buildGroupTheme = (dark) => ({
  algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#e8a923',
    colorInfo: '#e8a923',
    colorTextLightSolid: '#151a2c',
    borderRadius: 10,
    fontFamily: GROUP_FONT,
    colorBgLayout: dark ? '#151a2c' : '#f3f1ec',
    colorBgContainer: dark ? '#1d2338' : '#fbfaf7',
    colorBgElevated: dark ? '#1d2338' : '#fbfaf7',
    colorText: dark ? '#ede6d6' : '#1a2140',
    colorTextSecondary: dark ? '#aeb4cc' : '#4a5170',
    colorBorder: dark ? '#5a6590' : '#8c8878',
    colorBorderSecondary: dark ? '#313a58' : '#d5d2c8',
    controlHeight: 44,
  },
});
