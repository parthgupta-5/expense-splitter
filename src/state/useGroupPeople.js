import { useCallback, useEffect, useState } from 'react';
import * as repo from '../data/cloudRepo';
import { friendlyError } from '../lib/errors';

/**
 * Each person's status in one signed-in group (list_group_people(): member, invitation pending, guest; the owner also
 * sees answered invitations). Re-read when the group's people change, and when the workspace's live channel says an
 * invitation changed (so the owner sees an accept or decline without reloading). Guest groups have no statuses.
 */
export function useGroupPeople({ group, enabled, onInvitationsChange }) {
  const groupId = group?.id ?? null;
  const [state, setState] = useState({
    groupId: null, rows: [], loaded: false, error: '',
  });
  // People added, removed or linked arrive as a new group object from the server.
  const peopleKey = JSON.stringify([group?.people, group?.personRecords]);

  const reload = useCallback(() => {
    if (!enabled || !groupId) return Promise.resolve();
    return repo.listGroupPeople(groupId)
      .then((rows) => setState({
        groupId, rows: rows || [], loaded: true, error: '',
      }))
      .catch((error) => setState((current) => ({
        ...current, groupId, loaded: true, error: friendlyError(error),
      })));
  }, [enabled, groupId]);

  useEffect(() => { reload(); }, [reload, peopleKey]);
  useEffect(() => (enabled && onInvitationsChange ? onInvitationsChange(() => { reload(); }) : undefined), [
    enabled, onInvitationsChange, reload,
  ]);

  const mine = state.groupId === groupId;
  return {
    rows: mine ? state.rows : [], loaded: mine && state.loaded, error: mine ? state.error : '', reload,
  };
}
