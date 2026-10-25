/** "★ Naiwala · Main" style label for <option>s, which can't hold markup (see MainBadge). */
export const branchOptionLabel = (b: { name: string; is_main: boolean }) => (b.is_main ? `★ ${b.name} · Main` : b.name);
