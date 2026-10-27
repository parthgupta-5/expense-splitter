import React from 'react';
import { Tag, Typography } from 'antd';

const { Text } = Typography;

const LABELS = {
  pending: 'Pending', accepted: 'Accepted', declined: 'Declined', revoked: 'Revoked', expired: 'Expired',
};

/** An invitation's status in words (green only for accepted), with when a pending one expires. */
export default function InvitationStatus({ invitation }) {
  const { status } = invitation;
  return (
    <span className="invitation-status">
      <Tag color={status === 'accepted' ? 'success' : undefined}>{LABELS[status] || status}</Tag>
      {status === 'pending' && invitation.expires_at && (
        <Text type="secondary">Expires {new Date(invitation.expires_at).toLocaleDateString()}</Text>
      )}
    </span>
  );
}
