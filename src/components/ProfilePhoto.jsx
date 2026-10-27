import React, { useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { useApp } from '../state/AppContext';
import { friendlyError } from '../lib/errors';
import {
  AVATAR_ACCEPT, AvatarFileError, checkAvatarFile, reencodeAvatar,
} from '../lib/avatarImage';

const { Text } = Typography;

/**
 * Upload, change or remove the profile photo (signed-in only: it is part of the account section). The file is checked
 * and re-encoded here, so nothing but a fresh, metadata-free JPEG ever leaves the device. While working, both buttons
 * wait; if anything fails the current photo stays and the reason is shown under the buttons.
 */
export default function ProfilePhoto({ hasPhoto }) {
  const { workspace, notify, modal } = useApp();
  const input = useRef(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(null); // 'upload' | 'remove'
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const run = async (kind, task) => {
    if (working.current) return;
    working.current = true;
    setBusy(kind);
    setError('');
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(null);
      setStatus('');
    }
  };

  const upload = (file) => run('upload', async () => {
    try {
      setStatus('Preparing your photo…');
      await checkAvatarFile(file);
      const photo = await reencodeAvatar(file);
      setStatus('Uploading your photo…');
      await workspace.actions.setAvatar(photo);
      notify.success('Profile photo updated');
    } catch (failure) {
      setError(failure instanceof AvatarFileError
        ? failure.message
        : 'Your photo was not uploaded: ' + friendlyError(failure) + ' Your current photo is unchanged.');
    }
  });

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // choosing the same file again still triggers a change
    if (file) upload(file);
  };

  const remove = () => modal.confirm({
    title: 'Remove your profile photo?',
    content: 'Your initial will show instead.',
    okText: 'Remove photo',
    okButtonProps: { danger: true },
    onOk: () => run('remove', async () => {
      try {
        setStatus('Removing your photo…');
        await workspace.actions.removeAvatar();
        notify.success('Profile photo removed');
      } catch (failure) {
        setError('Your photo was not removed: ' + friendlyError(failure));
      }
    }),
  });

  return (
    <div className="profile-photo">
      <div className="profile-photo-actions">
        <Button size="small" onClick={() => input.current?.click()} loading={busy === 'upload'} disabled={Boolean(busy)}>
          {hasPhoto ? 'Change photo' : 'Upload photo'}
        </Button>
        {hasPhoto && (
          <Button size="small" danger onClick={remove} loading={busy === 'remove'} disabled={Boolean(busy)}>
            Remove photo
          </Button>
        )}
        <Text type="secondary" className="account-note">JPG, PNG or WebP, up to 5 MB</Text>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Profile photo file"
        onChange={onFile}
      />
      <Text type="secondary" className="profile-photo-status" role="status" aria-live="polite">{status}</Text>
      {error && <Text type="danger" className="profile-photo-error" role="alert">{error}</Text>}
    </div>
  );
}
