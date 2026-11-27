import type { CardCreate, Label } from '../api/types';

export function isWorkLabel(label: Label): boolean {
  return !/^(low$|medium$|high$|review:|priority:)/i.test(label.name.trim());
}

export function missingCardFields(card: CardCreate, labels: Label[]): string[] {
  const missing: string[] = [];
  if (!card.title.trim()) missing.push('a title');
  if (!card.description.trim()) missing.push('a description');
  if (!labels.some(label => card.label_ids.includes(label.id) && isWorkLabel(label))) missing.push('a work label');
  if (!card.assignee_ids.length) missing.push('an assignee');
  const independent = new Set(card.reviewer_ids.filter(id => !card.assignee_ids.includes(id)));
  if (independent.size < 2) missing.push('two distinct reviewers outside the assignee list');
  return missing;
}
