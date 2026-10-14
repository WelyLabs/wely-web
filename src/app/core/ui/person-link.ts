/** Where a person's name or picture leads: their friend page, or the viewer's own profile. */
export function personLink(userId: string, meId: string | null | undefined): string[] {
  return userId === meId ? ['/profile'] : ['/friends', userId];
}
