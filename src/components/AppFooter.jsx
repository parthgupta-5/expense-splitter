import React from 'react';
import { Link } from 'react-router';

/** Always-available links to the policies, on every page. */
export default function AppFooter() {
  return (
    <footer className="app-footer">
      <nav aria-label="Policies" className="app-footer-links">
        <Link to="/privacy">Privacy Policy</Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms">Terms of Service</Link>
      </nav>
    </footer>
  );
}
