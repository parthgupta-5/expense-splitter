import React from 'react';

// Last line of defence: a render error shows a recovery screen instead of a blank page.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error('Unhandled UI error', error, info.componentStack); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{ maxWidth: 480, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}
      >
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>Your data is still saved on this device. Reload the page to continue.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '8px 16px', fontSize: 16 }}
        >
          Reload
        </button>
      </div>
    );
  }
}
