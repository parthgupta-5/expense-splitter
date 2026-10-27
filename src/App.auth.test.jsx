// @vitest-environment jsdom
// Sign-up with an emailed code, sign-in, Google, password reset and /auth/callback: the real App and router, with
// Supabase Auth (useAuth) and the data layer mocked. No real codes, tokens or passwords are involved.
import React, { StrictMode } from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import * as repo from './data/cloudRepo';

const mocks = vi.hoisted(() => ({ auth: {} }));

vi.mock('./supabase', () => ({ supabase: null, supabaseConfigured: true, normalizeSupabaseUrl: () => '' }));
vi.mock('./state/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./data/cloudRepo', () => ({
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  subscribeToChanges: vi.fn(),
  importGroup: vi.fn(),
  checkUsername: vi.fn(),
  suggestUsername: vi.fn(),
  setUsername: vi.fn(),
}));

const STRONG = 'Correct-Horse-9';
const pending = () => new Promise(() => {});

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  mocks.auth = {
    user: null,
    ready: true,
    recovering: false,
    signUp: vi.fn(),
    verifySignUpCode: vi.fn(),
    resendSignUpCode: vi.fn().mockResolvedValue(),
    signIn: vi.fn().mockResolvedValue(),
    signInWithGoogle: vi.fn(),
    exchangeCode: vi.fn(),
    signOut: vi.fn().mockResolvedValue(),
    sendPasswordReset: vi.fn().mockResolvedValue(),
    verifyRecoveryCode: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(),
    updateDisplayName: vi.fn().mockResolvedValue(),
  };
  repo.fetchGroups.mockResolvedValue([]);
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.checkUsername.mockResolvedValue('available');
  repo.suggestUsername.mockResolvedValue('asharao');
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

// antd gives every element the id "test-id" under test, so find dialogs by the title they show.
const dialogTitled = (title) => screen.queryAllByRole('dialog').find((dialog) => within(dialog).queryByText(title)) || null;
const findDialog = async (title) => {
  await waitFor(() => expect(dialogTitled(title)).toBeTruthy());
  return dialogTitled(title);
};

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppProvider><App /></AppProvider>
  </MemoryRouter>,
);
/** Opens the address in the real (jsdom) address bar, so the test can see it being cleared. */
const openUrl = (url) => {
  window.history.replaceState(null, '', url);
  return render(<StrictMode><BrowserRouter><AppProvider><App /></AppProvider></BrowserRouter></StrictMode>);
};

async function openSignUp(user) {
  renderAt('/profile');
  await user.click(await screen.findByRole('button', { name: /Sign in or create account/ }));
  return findDialog('Create your account');
}

async function openSignIn(user) {
  const dialog = await openSignUp(user);
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
  return findDialog('Welcome back');
}

describe('sign up', () => {
  it('shows live password guidance and refuses a password that breaks the policy', async () => {
    const user = userEvent.setup();
    const dialog = await openSignUp(user);
    const rules = within(dialog).getByRole('list', { name: 'Password requirements' });
    expect(within(rules).getAllByText('(still needed)', { exact: false })).toHaveLength(5);

    await user.type(within(dialog).getByLabelText(/your name/i), 'Asha');
    await user.type(within(dialog).getByLabelText(/email address/i), 'asha@example.com');
    const password = within(dialog).getByLabelText(/^password\*?$/i);
    const described = password.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id));
    expect(described.some((element) => element?.contains(rules))).toBe(true); // screen readers hear the rules
    await user.type(password, 'longbutlowercase');
    expect(within(rules).getAllByText('(done)', { exact: false })).toHaveLength(2); // length + lowercase
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByText(/Your password needs: an uppercase letter, a number, a symbol/)).toBeTruthy();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();

    await user.clear(password);
    await user.type(password, STRONG);
    expect(within(rules).getAllByText('(done)', { exact: false })).toHaveLength(5);
  });

  it('creates the account, then confirms the email with the 6-digit code', async () => {
    const user = userEvent.setup();
    mocks.auth.signUp.mockResolvedValue({ needsConfirmation: true });
    mocks.auth.verifySignUpCode
      .mockRejectedValueOnce(Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }))
      .mockResolvedValueOnce();
    const dialog = await openSignUp(user);
    await user.type(within(dialog).getByLabelText(/your name/i), ' Asha ');
    await user.type(within(dialog).getByLabelText(/email address/i), 'asha@example.com');
    await user.type(within(dialog).getByLabelText(/^password\*?$/i), STRONG);
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: 'asha@example.com', password: STRONG, displayName: 'Asha',
    }));

    const step = await findDialog('Confirm your email');
    expect(within(step).getByText('asha@example.com')).toBeTruthy();
    expect(within(step).getByRole('button', { name: /Send a new code in \d+s/ }).disabled).toBe(true);
    const code = within(step).getByLabelText('6-digit code');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('inputmode')).toBe('numeric');

    await user.click(within(step).getByRole('button', { name: 'Confirm email' }));
    expect(await within(step).findByText('Enter the 6 digits from the email.')).toBeTruthy();
    expect(mocks.auth.verifySignUpCode).not.toHaveBeenCalled();

    await user.type(code, '111111');
    await user.click(within(step).getByRole('button', { name: 'Confirm email' }));
    expect(await within(step).findByText(/That code is wrong or has expired/)).toBeTruthy();

    await user.clear(code);
    await user.type(code, '123 456');
    expect(code.value).toBe('123456');
    await user.click(within(step).getByRole('button', { name: 'Confirm email' }));
    await waitFor(() => expect(mocks.auth.verifySignUpCode).toHaveBeenLastCalledWith({ email: 'asha@example.com', code: '123456' }));
  });

  it('sends only one request when Create account is pressed twice', async () => {
    const user = userEvent.setup();
    mocks.auth.signUp.mockReturnValue(pending());
    const dialog = await openSignUp(user);
    await user.type(within(dialog).getByLabelText(/your name/i), 'Asha');
    await user.type(within(dialog).getByLabelText(/email address/i), 'asha@example.com');
    await user.type(within(dialog).getByLabelText(/^password\*?$/i), STRONG);
    const create = within(dialog).getByRole('button', { name: 'Create account' });
    await user.click(create);
    await user.click(create);
    await waitFor(() => expect(mocks.auth.signUp).toHaveBeenCalledTimes(1));
  });
});

describe('sign in', () => {
  it('still accepts passwords made under the old 8-character rule', async () => {
    const user = userEvent.setup();
    const dialog = await openSignIn(user);
    expect(within(dialog).queryByRole('list', { name: 'Password requirements' })).toBeNull();
    await user.type(within(dialog).getByLabelText(/email address/i), 'ben@example.com');
    await user.type(within(dialog).getByLabelText(/^password\*?$/i), 'oldpass1');
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.auth.signIn).toHaveBeenCalledWith({ email: 'ben@example.com', password: 'oldpass1' }));
  });

  it('sends an unconfirmed account to the code step, where a new code can be sent straight away', async () => {
    const user = userEvent.setup();
    mocks.auth.signIn.mockRejectedValue(Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }));
    const dialog = await openSignIn(user);
    await user.type(within(dialog).getByLabelText(/email address/i), 'ben@example.com');
    await user.type(within(dialog).getByLabelText(/^password\*?$/i), STRONG);
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));

    const step = await findDialog('Confirm your email');
    await user.click(within(step).getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(mocks.auth.resendSignUpCode).toHaveBeenCalledWith('ben@example.com'));
    expect((await within(step).findByRole('status')).textContent).toBe('We sent a new code to ben@example.com.');
    expect(within(step).getByRole('button', { name: /Send a new code in \d+s/ }).disabled).toBe(true);
  });

  it('starts Google sign-in once and remembers the page to come back to', async () => {
    const user = userEvent.setup();
    mocks.auth.signInWithGoogle.mockReturnValue(pending()); // the browser would now leave for Google
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Sign in or create account' }));
    const dialog = await findDialog('Create your account');
    const google = within(dialog).getByRole('button', { name: /Continue with Google/ });
    await user.click(google);
    await user.click(google);
    expect(mocks.auth.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('expense-splitter-auth-return')).toBe('/settings');
  });

  it('explains when Google sign-in is not set up yet', async () => {
    const user = userEvent.setup();
    mocks.auth.signInWithGoogle.mockRejectedValue(new Error('Unsupported provider: provider is not enabled'));
    const dialog = await openSignUp(user);
    await user.click(within(dialog).getByRole('button', { name: /Continue with Google/ }));
    expect(await screen.findByText('Google sign-in is not set up yet.')).toBeTruthy();
  });
});

describe('forgotten password', () => {
  it('emails a code, and the code signs the user in to choose a new password', async () => {
    const user = userEvent.setup();
    mocks.auth.verifyRecoveryCode.mockResolvedValue();
    const signIn = await openSignIn(user);
    await user.click(within(signIn).getByRole('button', { name: 'Forgot password?' }));
    const forgot = await findDialog('Reset your password');
    await user.type(within(forgot).getByLabelText(/email address/i), 'ben@example.com');
    await user.click(within(forgot).getByRole('button', { name: 'Send code' }));
    await waitFor(() => expect(mocks.auth.sendPasswordReset).toHaveBeenCalledWith('ben@example.com'));

    const step = await findDialog('Enter your reset code');
    expect(within(step).getByText(/If this email has an account/)).toBeTruthy(); // never says whether it exists
    await user.type(within(step).getByLabelText('6-digit code'), '654321');
    await user.click(within(step).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mocks.auth.verifyRecoveryCode).toHaveBeenCalledWith({ email: 'ben@example.com', code: '654321' }));
  });
});

describe('/auth/callback', () => {
  it('exchanges the code once, clears it from the address bar and returns to the remembered page', async () => {
    window.sessionStorage.setItem('expense-splitter-auth-return', '/history');
    mocks.auth.exchangeCode.mockResolvedValue({ recovery: false });
    openUrl('/auth/callback?code=one-time-code-123&sb_flow_id=flow-1');
    await waitFor(() => expect(window.location.pathname).toBe('/history'));
    expect(mocks.auth.exchangeCode).toHaveBeenCalledTimes(1); // even with StrictMode's double effects
    expect(mocks.auth.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'one-time-code-123', flowId: 'flow-1' }));
    expect(window.location.href).not.toMatch(/one-time-code|flow-1/);
  });

  it('never follows a return path that leaves the site', async () => {
    window.sessionStorage.setItem('expense-splitter-auth-return', '//evil.example/steal');
    mocks.auth.exchangeCode.mockResolvedValue({ recovery: false });
    openUrl('/auth/callback?code=c2');
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/groups/));
    expect(window.location.origin).toBe('http://localhost:3000');
    expect(window.location.href).not.toMatch(/evil/);
  });

  it('sends a password-reset link to the new-password page', async () => {
    mocks.auth.exchangeCode.mockResolvedValue({ recovery: true });
    openUrl('/auth/callback?code=c3');
    await waitFor(() => expect(window.location.pathname).toBe('/reset-password'));
  });

  it('explains a cancelled Google sign-in, without exchanging anything', async () => {
    openUrl('/auth/callback?error=access_denied&error_description=The+user+denied+the+request');
    expect(await screen.findByText('Google sign-in was cancelled. Nothing was changed.')).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(mocks.auth.exchangeCode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue without an account' })).toBeTruthy();
  });

  it('explains an expired or already-used link', async () => {
    mocks.auth.exchangeCode.mockRejectedValue(Object.assign(new Error('invalid flow state'), { code: 'flow_state_not_found' }));
    openUrl('/auth/callback?code=used');
    expect(await screen.findByText(/This sign-in link has expired or was already used/)).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('moves on when there is nothing to finish', async () => {
    mocks.auth.user = { id: 'user-1', email: 'asha@example.com', user_metadata: {} };
    repo.fetchProfile.mockResolvedValue({ id: 'user-1', display_name: 'Asha', username: 'asha', username_confirmed_at: '2026-10-01' });
    window.sessionStorage.setItem('expense-splitter-auth-return', '/people');
    openUrl('/auth/callback');
    await waitFor(() => expect(window.location.pathname).toBe('/people'));
    expect(mocks.auth.exchangeCode).not.toHaveBeenCalled();
  });
});

describe('new password after a reset', () => {
  const signedInRecovering = () => {
    mocks.auth.user = { id: 'user-1', email: 'asha@example.com', user_metadata: {} };
    mocks.auth.recovering = true;
    repo.fetchProfile.mockResolvedValue({
      id: 'user-1', display_name: 'Asha', username: 'user_ab12cd34', username_confirmed_at: null,
    });
  };

  it('applies the policy, then saves, with the username dialog waiting until it is done', async () => {
    const user = userEvent.setup();
    signedInRecovering();
    renderAt('/reset-password');
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeTruthy();
    const password = screen.getByLabelText(/^new password/i);
    await user.type(password, 'Short1!');
    await user.type(screen.getByLabelText(/repeat new password/i), 'Short1!');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText(/Your password needs: at least 12 characters/)).toBeTruthy();
    expect(mocks.auth.updatePassword).not.toHaveBeenCalled();
    expect(dialogTitled('Choose your username')).toBeNull();

    await user.clear(password);
    await user.type(password, STRONG);
    await user.clear(screen.getByLabelText(/repeat new password/i));
    await user.type(screen.getByLabelText(/repeat new password/i), STRONG);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(mocks.auth.updatePassword).toHaveBeenCalledWith(STRONG));
  });

  it('asks for a code when opened without being signed in', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText('Ask for a reset code first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send a reset code' })).toBeTruthy();
  });
});

describe('Google accounts', () => {
  it('fill an empty profile name from Google before the username is suggested', async () => {
    mocks.auth.user = { id: 'user-2', email: 'g@example.com', user_metadata: { full_name: 'Gita Rao' } };
    repo.fetchProfile.mockResolvedValue({ id: 'user-2', display_name: '', username: 'user_0000aaaa', username_confirmed_at: null });
    repo.saveProfile.mockResolvedValue();
    renderAt('/settings');
    await findDialog('Choose your username');
    expect(repo.saveProfile).toHaveBeenCalledWith('user-2', { display_name: 'Gita Rao' });
    expect(repo.saveProfile.mock.invocationCallOrder[0]).toBeLessThan(repo.suggestUsername.mock.invocationCallOrder[0]);
    expect(screen.getByRole('heading', { level: 2, name: 'Gita Rao' })).toBeTruthy();
  });
});
