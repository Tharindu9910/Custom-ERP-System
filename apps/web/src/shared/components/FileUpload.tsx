import { useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSizeMb?: number;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  onFilesSelected,
  accept,
  maxSizeMb = 10,
  multiple = false,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);

    const oversized = Array.from(list).filter(
      (f) => f.size > maxSizeMb * 1024 * 1024,
    );
    if (oversized.length > 0) {
      setError(`File(s) exceed ${maxSizeMb} MB limit.`);
      return;
    }

    onFilesSelected(multiple ? Array.from(list) : [list[0]]);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) processFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="text-2xl">📎</span>
        <p className="text-sm font-medium text-gray-700">
          Drop file{multiple ? 's' : ''} here or click to browse
        </p>
        <p className="text-xs text-gray-500">Max {maxSizeMb} MB per file</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => processFiles(e.target.files)}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}