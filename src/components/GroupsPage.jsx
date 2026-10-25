import React from 'react';
import { Avatar, Button, Card, Col, Empty, Popconfirm, Row, Statistic, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export default function GroupsPage({ groups, activeGroupId, currencySymbol, onNew, onOpen, onDelete }) {
  return (
    <section className="page-panel">
      <div className="page-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New group</Button>
      </div>
      <Row gutter={[16, 16]}>
        {groups.map((group, index) => {
          const active = group.id === activeGroupId;
          const groupTotal = (group.expenses || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
          return (
            <Col xs={24} sm={12} xl={8} key={group.id}>
              <Card
                className={'group-card ' + (active ? 'group-card-active' : '')}
                hoverable
                onClick={() => onOpen(group.id)}
              >
                <div className="group-card-top">
                  <Avatar className={'group-avatar avatar-tone-' + (index % 5)} icon={<TeamOutlined />} />
                  <Tag color={active ? 'blue' : 'default'}>{active ? 'Current' : 'Saved'}</Tag>
                </div>
                <Title level={4}>{group.name}</Title>
                <Text type="secondary">{group.people?.length || 0} people · {group.expenses?.length || 0} expenses</Text>
                <div className="group-card-bottom">
                  <Statistic title="Group spend" value={groupTotal} precision={2} prefix={currencySymbol} />
                  <Popconfirm
                    title="Delete this group and its saved activity?"
                    description="This removes the group from your account and local device."
                    onConfirm={(event) => { event?.stopPropagation?.(); onDelete(group); }}
                    onCancel={(event) => event?.stopPropagation?.()}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={'Delete ' + group.name}
                    />
                  </Popconfirm>
                </div>
                <Button block onClick={(event) => { event.stopPropagation(); onOpen(group.id); }}>Open group</Button>
              </Card>
            </Col>
          );
        })}
      </Row>
      {groups.length === 0 && (
        <Empty description={false}><Button type="primary" onClick={onNew}>Create a group</Button></Empty>
      )}
    </section>
  );
}
