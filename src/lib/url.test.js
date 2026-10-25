import { describe, expect, it } from 'vitest';
import { isHttpsUrl } from './url';

describe('isHttpsUrl', () => {
  it('accepts https and rejects other schemes', () => {
    expect(isHttpsUrl('https://example.com/a.png')).toBe(true);
    expect(isHttpsUrl('http://example.com/a.png')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});
