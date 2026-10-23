import { useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { apiError } from '@/shared/api/errors';
import { useAttachmentUrl, useUploadDesignPhoto } from '../hooks/useRoofing';
import { compressImage } from '../lib/compress-image';

const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';

/**
 * Design photo for a customized item (prototype renderPhotoField). The photo is
 * uploaded straight away; the item keeps only the attachment id.
 */
export function DesignPhotoField({ value, required, onChange }: { value?: string; required: boolean; onChange: (id: string | undefined) => void }) {
  const upload = useUploadDesignPhoto();
  const url = useAttachmentUrl(value);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const blob = await compressImage(file);
      const res = await upload.mutateAsync(blob);
      onChange(res.attachment_id);
    } catch (e) {
      setError(e instanceof Error && !('isAxiosError' in e) ? 'Could not read this image. Please try another photo.' : apiError(e).message);
    }
  };

  const input = (capture: boolean) => (
    <input
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'environment' as const } : {})}
      className="hidden"
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <div className="col-span-full">
      <label className={labelCls}>Design Photo {required && <span className="text-red-500">*</span>}</label>
      {value ? (
        <div className="flex items-start gap-3">
          {url ? (
            <img src={url} alt="Design" className="h-32 w-auto rounded-md border border-gray-300 bg-white object-contain" />
          ) : (
            <div className="h-32 w-32 animate-pulse rounded-md border border-gray-300 bg-gray-100" />
          )}
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
              {upload.isPending ? 'Uploading…' : 'Change photo'}
              {input(false)}
            </label>
            <button type="button" onClick={() => onChange(undefined)} className="text-left text-sm font-medium text-red-600 hover:text-red-800">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white py-6 text-gray-500 hover:border-blue-400 hover:text-blue-600">
          <Icon name="imagePlus" className="mb-1 h-7 w-7" />
          <span className="text-sm font-medium">{upload.isPending ? 'Uploading…' : 'Tap to upload or take a photo of the design'}</span>
          {input(true)}
        </label>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
