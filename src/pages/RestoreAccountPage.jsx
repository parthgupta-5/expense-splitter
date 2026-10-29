import React, { useState } from 'react';
import { Alert, Button, Result } from 'antd';
import { useApp } from '../state/AppContext';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';

const RESTORE_DAYS = 7;
const longDate = (date) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Shown instead of the app to an account that is waiting to be deleted. It can be restored until the 7 days are over;
 * after that it is deleted for good (supabase/functions/purge-deleted-accounts).
 */
export default function RestoreAccountPage() {
  const { auth, workspace, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const requested = new Date(workspace.profile.deletion_requested_at);
  const deletesOn = new Date(requested.getTime() + RESTORE_DAYS * 24 * 60 * 60 * 1000);

  const restore = async () => {
    setBusy(true);
    setProblem('');
    try {
      await repo.restoreAccount();
      workspace.actions.setProfile({ ...workspace.profile, deletion_requested_at: null });
      notify.success('Welcome back. Your account is restored.');
    } catch (error) {
      setProblem(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Result
      status="warning"
      className="restore-account"
      title="Your account is scheduled for deletion"
      subTitle={(
        <>
          It will be deleted for good on <strong>{longDate(deletesOn)}</strong>. Until then it is switched off: nobody can
          find you, invite you or send you friend requests. Restore it to keep everything as it was. Invitations and
          friend requests that were waiting when you deleted it are not brought back.
        </>
      )}
      extra={(
        <>
          {problem && <Alert type="error" showIcon className="restore-problem" title={problem} />}
          <Button type="primary" loading={busy} onClick={restore}>Restore my account</Button>
          <Button onClick={() => auth.signOut()} disabled={busy}>Sign out</Button>
        </>
      )}
    />
  );
}
