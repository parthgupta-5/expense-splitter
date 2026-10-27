import React from 'react';
import { Avatar } from 'antd';

const TONES = 4;

/**
 * The user's profile photo when they have one (`src`, which must be their own managed photo URL), otherwise a generated
 * monochrome avatar: the first letter of the name on one of four grey tones, picked from a stable seed (the user id),
 * so the same person always looks the same. If the photo cannot load, the letter shows instead. Decorative: the name
 * is always shown next to it.
 */
export default function UserAvatar({
  name, seed = name, size, src = null, className = '',
}) {
  const letter = (Array.from(String(name || '').trim())[0] || '?').toUpperCase();
  let hash = 0;
  for (const char of String(seed || '')) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return (
    <Avatar
      size={size}
      src={src || undefined}
      alt=""
      draggable={false}
      className={`user-avatar user-avatar-tone-${hash % TONES} ${src ? 'has-photo ' : ''}${className}`.trim()}
      aria-hidden="true"
    >
      {letter}
    </Avatar>
  );
}
