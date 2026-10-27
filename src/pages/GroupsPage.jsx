import React from 'react';
import { useNavigate } from 'react-router';
import {
  Avatar, Button, Card, Col, Empty, Row, Statistic, Tag, Typography,
} from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useApp } from '../state/AppContext';
import PageIntro from '../components/PageIntro';
import { currencySymbol } from '../lib/currency';
import { sumAmounts } from '../lib/splits';
import { readLastGroup } from '../lib/storage';

const { Text, Title } = Typography;

export default function GroupsPage() {
  const { workspace, openGroupDialog } = useApp();
  const navigate = useNavigate();
  const { groups } = workspace;
  const lastGroupId = readLastGroup();
  const open = (group) => navigate('/groups/' + group.id);

  return (
    <>
      <PageIntro title="Your groups" />
      <section className="page-panel">
        <div className="page-toolbar">
          <Button type="primary" icon={<PlusOutlined />} onClick={openGroupDialog}>New group</Button>
        </div>
        <Row gutter={[16, 16]}>
          {groups.map((group, index) => {
            const recent = group.id === lastGroupId;
            const groupTotal = sumAmounts((group.expenses || []).map((expense) => expense.amount));
            return (
              <Col xs={24} sm={12} xl={8} key={group.id}>
                <Card className={'group-card ' + (recent ? 'group-card-active' : '')} hoverable onClick={() => open(group)}>
                  <div className="group-card-top">
                    <Avatar className={'group-avatar avatar-tone-' + (index % 5)} icon={<TeamOutlined />} />
                    <span>
                      {group.cloud && group.memberCount > 1 && <Tag color="purple">Shared</Tag>}
                      {group.cloud && group.role === 'member' && <Tag>Member</Tag>}
                      {recent && <Tag color="blue">Last opened</Tag>}
                    </span>
                  </div>
                  <Title level={4}>{group.name}</Title>
                  <Text type="secondary">{group.people?.length || 0} people · {group.expenses?.length || 0} expenses</Text>
                  <div className="group-card-bottom">
                    <Statistic
                      title="Group spend"
                      value={groupTotal}
                      precision={2}
                      prefix={currencySymbol(group.currencyCode)}
                    />
                  </div>
                  <Button block onClick={(event) => { event.stopPropagation(); open(group); }}>Open group</Button>
                </Card>
              </Col>
            );
          })}
        </Row>
        {groups.length === 0 && (
          <Empty description="No groups yet. Create one for a trip, a flat or a dinner.">
            <Button type="primary" onClick={openGroupDialog}>Create a group</Button>
          </Empty>
        )}
      </section>
    </>
  );
}
