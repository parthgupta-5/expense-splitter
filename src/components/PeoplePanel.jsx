import React from 'react';
import { Button, Input, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Title } = Typography;
const TAG_COLORS = ['blue', 'purple', 'cyan', 'gold', 'green'];

export default function PeoplePanel({ groupName, people, value, onChange, onAdd, onRemove }) {
  return (
    <section className="section-card people-card">
      <div className="section-heading">
        <div><Title level={4}>People in {groupName}</Title></div>
        <Tag>{people.length} {people.length === 1 ? 'person' : 'people'}</Tag>
      </div>
      <Space.Compact className="add-person">
        <Input
          maxLength={400}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPressEnter={() => onAdd()}
          placeholder="Add a name or several names separated by commas"
          aria-label="Add participant name"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onAdd()}>Add people</Button>
      </Space.Compact>
      <div className="people-list">
        {people.map((name, index) => (
          <Tag
            key={name}
            closable
            onClose={(event) => { event.preventDefault(); onRemove(name); }}
            color={TAG_COLORS[index % TAG_COLORS.length]}
          >
            {name}
          </Tag>
        ))}
      </div>
    </section>
  );
}
