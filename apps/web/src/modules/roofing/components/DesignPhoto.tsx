import { useAttachmentUrl } from '../hooks/useRoofing';

/** Design photo thumbnail; opens the full photo in a new tab. */
export function DesignPhoto({ attachmentId, className = 'h-14 w-14' }: { attachmentId: string; className?: string }) {
  const url = useAttachmentUrl(attachmentId);
  if (!url) return <div className={`${className} shrink-0 animate-pulse rounded border border-gray-200 bg-gray-100`} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <img src={url} alt="Design" className={`${className} rounded border border-gray-200 object-cover`} />
    </a>
  );
}
