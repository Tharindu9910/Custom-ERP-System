/** `%text%` for ILIKE with the user's own % and _ taken literally (the default escape is backslash). */
export const likeContains = (text: string): string => `%${text.replace(/[%_\\]/g, '\\$&')}%`;
