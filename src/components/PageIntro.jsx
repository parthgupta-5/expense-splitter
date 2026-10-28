import React, { useEffect } from 'react';
import { Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/** Sets the browser tab title, so history entries and bookmarks are meaningful. */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? title + ' · Expense Splitter' : 'Expense Splitter';
  }, [title]);
}

/** Page heading; also sets the browser tab title. `icon={false}` leaves out the decorative tile (compact pages). */
export default function PageIntro({
  eyebrow = 'EXPENSE SPLITTER', title, documentTitle, extra, icon = true,
}) {
  useDocumentTitle(documentTitle || (typeof title === 'string' ? title : ''));

  return (
    <div className="page-intro">
      <div>
        <Text className="eyebrow">{eyebrow}</Text>
        <Title level={1}>{title}</Title>
        {extra && <div className="page-intro-extra">{extra}</div>}
      </div>
      {icon && <div className="intro-icon" aria-hidden="true"><TeamOutlined /></div>}
    </div>
  );
}
