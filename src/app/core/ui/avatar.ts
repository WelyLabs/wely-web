const AVATAR_COLORS = ['#2563eb', '#c2410c', '#0f766e', '#7c3aed', '#be185d', '#4d7c0f'];

/** Two letters for an avatar: first and last name, or the first two letters of a single name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** A stable colour per person, so an avatar keeps its colour from one screen to the next. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
