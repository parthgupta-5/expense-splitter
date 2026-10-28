import React from 'react';
import { Link } from 'react-router';
import { Alert, Typography } from 'antd';
import PageIntro from './PageIntro';

const { Paragraph, Text } = Typography;

export const LEGAL_UPDATED = '28 October 2026';

/** A readable, public policy page (no account needed). `sections` are { id, title, body } in order. */
export default function LegalPage({
  title, intro, sections, other,
}) {
  return (
    <>
      <PageIntro eyebrow="EXPENSE SPLITTER" title={title} />
      <article className="page-panel legal-page" aria-label={title}>
        <Alert
          type="info"
          showIcon
          className="legal-notice"
          title="A plain-language policy for a project app, not legal advice."
          description="Expense Splitter is a small project (an MVP), not a company product. This page describes what the app actually does today. It has not been reviewed by a lawyer and makes no claim of certification or of compliance with any particular law."
        />
        <Text type="secondary" className="legal-updated">Last updated {LEGAL_UPDATED}</Text>
        <Paragraph className="legal-intro">{intro}</Paragraph>
        <nav aria-label="On this page" className="legal-toc">
          <ol>
            {sections.map((section) => <li key={section.id}><a href={'#' + section.id}>{section.title}</a></li>)}
          </ol>
        </nav>
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={section.id + '-title'} className="legal-section">
            <h2 id={section.id + '-title'}>{section.title}</h2>
            {section.body}
          </section>
        ))}
        <p className="legal-other">
          See also: <Link to={other.to}>{other.label}</Link>
        </p>
      </article>
    </>
  );
}
