import React from 'react';
import { Drawer, Modal } from 'antd';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from './Icons';

export const DESKTOP_QUERY = '(min-width: 960px)';

/**
 * A bottom sheet on phones and a side drawer on desktop. Ant Design's Drawer supplies the focus trap, Escape,
 * scroll lock and dialog semantics; everything visible is drawn here.
 */
export function Sheet({ open, onClose, title, children, footer }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={desktop ? 'right' : 'bottom'}
      size={desktop ? 460 : '92dvh'}
      closable={false}
      destroyOnHidden
      rootClassName="gp-sheet-root"
      className="gp-sheet"
      title={<span className="gp-sheet-title">{title}</span>}
      extra={(
        <button type="button" className="gp-icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      )}
      footer={footer}
    >
      {children}
    </Drawer>
  );
}

/** A small confirmation dialog, used wherever the old UI used popconfirms and confirm modals. */
export function ConfirmDialog({ request, onClose }) {
  const open = Boolean(request);
  const run = () => {
    const { onOk } = request;
    onClose();
    onOk?.();
  };
  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      closable={false}
      footer={null}
      destroyOnHidden
      rootClassName="gp-confirm-root"
      className="gp-confirm"
      title={<span className="gp-sheet-title">{request?.title}</span>}
      width={400}
    >
      {request?.content && <p className="gp-confirm-text">{request.content}</p>}
      <div className="gp-confirm-actions">
        <button type="button" className="gp-button" onClick={onClose}>Cancel</button>
        <button type="button" className={'gp-button ' + (request?.danger ? 'is-danger' : 'is-primary')} onClick={run}>
          {request?.okText || 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}
