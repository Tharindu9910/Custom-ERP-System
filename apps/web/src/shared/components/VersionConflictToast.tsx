interface VersionConflictToastProps {
  entityName: string;
  onRefresh: () => void;
  onDismiss: () => void;
}

export function VersionConflictToast({
  entityName,
  onRefresh,
  onDismiss,
}: VersionConflictToastProps) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex w-80 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-lg"
    >
      <span className="mt-0.5 text-amber-600" aria-hidden="true">
        ⚠
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900">
          {entityName} was modified
        </p>
        <p className="mt-0.5 text-xs text-amber-700">
          Someone else saved changes while you were editing. Refresh to see the
          latest version.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={onRefresh}
            className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Refresh
          </button>
          <button
            onClick={onDismiss}
            className="rounded-md px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}