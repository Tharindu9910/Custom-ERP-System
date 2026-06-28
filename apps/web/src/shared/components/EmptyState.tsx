import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
  action?: ReactNode;
}

export function EmptyState({
  title = 'No results',
  message,
  icon = '📭',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
      {message && (
        <p className="mt-1 text-sm text-gray-500">{message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}