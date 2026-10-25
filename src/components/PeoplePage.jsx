import React from 'react';
import { Avatar, Button, Empty, Input, List, Popconfirm, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export default function PeoplePage({ savedPeople, value, onChange, onSave, groupName, onAddToGroup, onRemove }) {
  return (
    <section className="page-panel">
      <Space.Compact className="add-person library-add">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPressEnter={onSave}
          placeholder="Add one or more names"
          aria-label="Save people"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={onSave}>Save people</Button>
      </Space.Compact>
      {savedPeople.length ? (
        <List
          className="saved-people-list"
          dataSource={savedPeople}
          renderItem={(person) => (
            <List.Item
              actions={[
                <Button key="add" type="link" onClick={() => onAddToGroup(person)}>Add to {groupName || 'group'}</Button>,
                <Popconfirm
                  key="remove"
                  title={'Remove ' + person + ' from saved people?'}
                  onConfirm={() => onRemove(person)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={'Remove ' + person} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta avatar={<Avatar>{person.slice(0, 1).toUpperCase()}</Avatar>} title={person} />
            </List.Item>
          )}
        />
      ) : (
        <Empty className="empty-panel" description="No saved people yet. Add names above to reuse them in any group." />
      )}
    </section>
  );
}
