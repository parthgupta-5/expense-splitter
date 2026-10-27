import React, { useState } from 'react';
import {
  Avatar, Button, Empty, Input, List, Popconfirm, Space,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import { describeRejected, parseNames } from '../lib/people';
import { readLastGroup } from '../lib/storage';

/** A reusable list of names, so regulars can be added to any group in one click. */
export default function PeoplePage() {
  const { workspace, notify } = useApp();
  const { savedPeople, groups, actions } = workspace;
  const [value, setValue] = useState('');
  const group = groups.find((item) => item.id === readLastGroup()) || groups[0];

  const save = () => {
    const parsed = parseNames(value, savedPeople);
    const rejected = describeRejected(parsed);
    if (rejected) notify.error('Not saved, ' + rejected);
    if (!parsed.valid.length) return;
    actions.setSavedPeople((current) => [...current, ...parsed.valid]);
    setValue('');
    notify.success('People saved to your list');
  };

  const addToGroup = async (person) => {
    if (!group) { notify.info('Create a group first'); return; }
    if (group.people.some((name) => name.toLowerCase() === person.toLowerCase())) {
      notify.info(person + ' is already in ' + group.name);
      return;
    }
    if (await actions.addPeople(group.id, [person])) notify.success(person + ' added to ' + group.name);
  };

  return (
    <>
      <PageIntro title="Saved people" />
      <section className="page-panel">
        <Space.Compact className="add-person library-add">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onPressEnter={save}
            placeholder="Add one or more names, separated by commas"
            aria-label="Names to save"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={save}>Save people</Button>
        </Space.Compact>
        {savedPeople.length ? (
          <List
            className="saved-people-list"
            dataSource={savedPeople}
            renderItem={(person) => (
              <List.Item
                actions={[
                  group && (
                    <Button key="add" type="link" onClick={() => addToGroup(person)}>Add to {group.name}</Button>
                  ),
                  <Popconfirm
                    key="remove"
                    title={'Remove ' + person + ' from saved people?'}
                    onConfirm={() => actions.setSavedPeople((current) => current.filter((name) => name !== person))}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label={'Remove ' + person} />
                  </Popconfirm>,
                ].filter(Boolean)}
              >
                <List.Item.Meta avatar={<Avatar>{person.slice(0, 1).toUpperCase()}</Avatar>} title={person} />
              </List.Item>
            )}
          />
        ) : (
          <Empty className="empty-panel" description="No saved people yet. Add names above to reuse them in any group." />
        )}
      </section>
    </>
  );
}
