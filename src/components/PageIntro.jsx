import React, { useEffect } from 'react';
import { Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/** Page heading; also sets the browser tab title so history entries and bookmarks are meaningful. */
export default function PageIntro({
  eyebrow = 'EXPENSE SPLITTER', title, documentTitle, extra,
}) {
  const tabTitle = documentTitle || (typeof title === 'string' ? title : '');
  useEffect(() => {
    document.title = tabTitle ? tabTitle + ' · Expense Splitter' : 'Expense Splitter';
  }, [tabTitle]);

  return (
    <div className="page-intro">
      <div>
        <Text className="eyebrow">{eyebrow}</Text>
        <Title level={1}>{title}</Title>
        {extra && <div className="page-intro-extra">{extra}</div>}
      </div>
      <div className="intro-icon" aria-hidden="true"><TeamOutlined /></div>
    </div>
  );
}
