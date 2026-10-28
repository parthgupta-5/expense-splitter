import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useLocation } from 'react-router';
import {
  Button, Segmented, Select, Space, Upload,
} from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import AccountSettings from '../components/AccountSettings';
import DeleteAccount from '../components/DeleteAccount';
import PageIntro from '../components/PageIntro';
import { SettingRow, SettingsSection } from '../components/SettingsSection';
import { parseBackupText, portableGroup } from '../lib/backup';
import { CURRENCIES, DEFAULT_CURRENCY } from '../lib/currency';
import { downloadText } from '../lib/download';

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'data', label: 'Data' },
];
const THEMES = [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }];

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Scrolls to a section and moves focus to its heading, so keyboard and screen-reader users land there too. */
function goToSection(id, { smooth = true } = {}) {
  const heading = document.getElementById(id + '-heading') || document.getElementById(id);
  if (!heading) return;
  heading.scrollIntoView?.({ behavior: smooth && !reducedMotion() ? 'smooth' : 'auto', block: 'start' });
  heading.focus?.({ preventScroll: true });
}

/**
 * The menu's highlighted section, kept in step with scrolling: the last section whose top has passed the upper third of
 * the screen, or the last one at the very bottom of the page. `choose(id)` highlights a section picked from the menu,
 * which stays highlighted until the user scrolls by themselves (a short page cannot always bring the last section up to
 * the top). Returns [active, choose].
 */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const chosen = useRef(null);
  // Pressing Enter on a menu link fires keydown (which releases a choice) before click (which makes the new one).
  const choose = useCallback((id) => { chosen.current = id; setActive(id); }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (chosen.current) return;
      const nodes = SECTIONS.map(({ id }) => document.getElementById(id)).filter(Boolean);
      if (!nodes.length) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const passed = nodes.filter((node) => node.getBoundingClientRect().top <= window.innerHeight / 3);
      setActive(atBottom ? nodes.at(-1).id : (passed.at(-1) || nodes[0]).id);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const release = () => { chosen.current = null; };
    window.addEventListener('scroll', onScroll, { passive: true });
    ['wheel', 'touchstart', 'keydown'].forEach((type) => window.addEventListener(type, release, { passive: true }));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      ['wheel', 'touchstart', 'keydown'].forEach((type) => window.removeEventListener(type, release));
    };
  }, []);
  return [active, choose];
}

/**
 * Settings: a section menu (a column on wide screens, a row on phones) and one column of divider-separated sections.
 * Signed in: the account (with photo, username, sign-in and display name), preferences, data, then deleting the
 * account, set apart at the end. Guests: the same, with a sign-in offer instead of the account.
 */
export default function SettingsPage() {
  const {
    workspace, notify, modal, dark, toggleDark, openAuth,
  } = useApp();
  const { actions } = workspace;
  const cloud = workspace.mode === 'cloud';
  const { hash } = useLocation();
  const [active, choose] = useActiveSection();

  // A link such as /settings#delete-account (the way back from signing in again) opens at that section. The app
  // scrolls to the top on every page change, so this waits for that first.
  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!id) return undefined;
    const frame = requestAnimationFrame(() => {
      if (SECTIONS.some((section) => section.id === id)) choose(id);
      goToSection(id, { smooth: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, choose]);

  const select = (id) => { choose(id); goToSection(id); };

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
      <PageIntro title="Settings" icon={false} />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <ul>
            {SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={'#' + id}
                  className={'settings-nav-link' + (active === id ? ' is-active' : '')}
                  aria-current={active === id ? 'true' : undefined}
                  onClick={(event) => { event.preventDefault(); select(id); }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-content">
          <SettingsSection id="account" title="Account">
            {cloud ? <AccountSettings /> : (
              <SettingRow
                label="Not signed in"
                help="Your groups are saved on this device only. Sign in to keep them on every device and share them."
              >
                <Button onClick={() => openAuth('signup')}>Sign in or create account</Button>
              </SettingRow>
            )}
          </SettingsSection>

          <SettingsSection id="preferences" title="Preferences">
            <SettingRow label="Default currency" help="Used for new groups. Each group can have its own currency." labelFor="default-currency">
              <Select
                id="default-currency"
                className="settings-select"
                value={workspace.preferences.currency || DEFAULT_CURRENCY}
                options={CURRENCIES}
                onChange={(currency) => actions.setPreferences({ currency })}
              />
            </SettingRow>
            <SettingRow label="Theme" help="Saved on this device.">
              <Segmented
                aria-label="Theme"
                options={THEMES}
                value={dark ? 'dark' : 'light'}
                onChange={(value) => { if ((value === 'dark') !== dark) toggleDark(); }}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="data" title="Data">
            <SettingRow label="Backup" help="A JSON file you can import again later, here or on another device.">
              <Space wrap className="settings-actions">
                <Button icon={<DownloadOutlined />} onClick={exportBackup}>Download backup</Button>
                <Upload accept="application/json,.json" showUploadList={false} beforeUpload={importBackup}>
                  <Button icon={<UploadOutlined />}>Import backup</Button>
                </Upload>
              </Space>
            </SettingRow>
          </SettingsSection>

          {cloud && <DeleteAccount />}
        </div>
      </div>
    </>
  );
}
