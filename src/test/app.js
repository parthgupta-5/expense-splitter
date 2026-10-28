// Shared helpers for the app-level tests (the real App with Ant Design in jsdom).
//
// A *ByRole query reads the computed style of every element it searches, and jsdom matches each element against all of
// Ant Design's injected style rules to do it, so one page-wide role query can take longer than Testing Library's whole
// one-second wait on a busy CI runner. These helpers poll a cheap text query instead, then make the same role, name and
// visibility checks once, on the element found. Pages and dialogs are React.lazy chunks: preloadLazyModules() loads
// them before the tests, so a wait never has to cover a module being evaluated for the first time.
import { expect } from 'vitest';
import { isInaccessible, screen, within } from '@testing-library/react';

export { preloadLazyModules } from '../lazyModules';

const visible = (node) => node && !isInaccessible(node);

/** The heading of this level with exactly this text, once it is shown (like findByRole('heading', { level, name })). */
export async function findHeading(name, level) {
  const heading = await screen.findByText(name, { selector: `h${level}` });
  expect(visible(heading)).toBe(true);
  return heading;
}

/** The element matching `selector` around the visible text `text`, once it is shown: a card, panel, row or dialog. */
export async function findRegion(text, selector) {
  const node = await screen.findByText(text);
  const region = node.closest(selector);
  expect(region).toBeTruthy();
  return region;
}

/** The button with this accessible name inside `container` (one scoped role query, no polling). */
export const buttonIn = (container, name) => within(container).getByRole('button', { name });

/**
 * The button showing exactly this text, once it is shown (like findByRole('button', { name })). Its accessible name
 * must end with the text: Ant Design icons inside a button add their own label first ("login Sign in").
 */
export async function findButton(text) {
  const button = (await screen.findByText(text)).closest('button');
  expect(button).toBeTruthy();
  expect(within(button.parentElement).getAllByRole('button', { name: (name) => name.endsWith(text) })).toContain(button);
  return button;
}
