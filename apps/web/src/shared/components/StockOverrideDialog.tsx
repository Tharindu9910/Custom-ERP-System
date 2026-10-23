import { useState } from 'react';
import type { StockOverride } from '@erp/shared';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Notice } from './Notice';

export interface StockShortage {
  item_id: string;
  item_name: string;
  unit: string;
  required: number;
  /** Free stock: on hand minus what open orders hold */
  available: number;
  /** Held for other open orders */
  reserved?: number;
}

export interface StockShortageDetails {
  shortages: StockShortage[];
  override_allowed: boolean;
}

interface Props {
  details: StockShortageDetails;
  /** start: starting work deducts stock; save: saving an order holds stock for it */
  mode?: 'start' | 'save';
  pending: boolean;
  error: string | null;
  onConfirm: (override: StockOverride) => void;
  onClose: () => void;
}

/**
 * Shown when saving an order or starting work needs more branch stock than is
 * available (409 STK_001). Available excludes what other open orders hold
 * (Docs/decisions/0003). If the branch allows it, the supervisor can override with
 * the branch password and a reason (audited); otherwise stock must be transferred in first.
 */
export function StockOverrideDialog({ details, mode = 'start', pending, error, onConfirm, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const canSubmit = password.length > 0 && reason.trim().length >= 3;

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title="Not enough stock"
      subtitle={
        mode === 'save'
          ? 'This order needs more branch stock than is available. Saving holds the stock for it until work starts.'
          : "Starting this work deducts branch stock that isn't there."
      }
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {details.override_allowed && (
            <button
              type="button"
              disabled={!canSubmit || pending}
              onClick={() => onConfirm({ password, reason: reason.trim() })}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
            >
              <Icon name="key" />
              {mode === 'save' ? (pending ? 'Saving…' : 'Override and save') : pending ? 'Starting…' : 'Override and start'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <table className="min-w-full divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Needed</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-right">Short</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {details.shortages.map((s) => (
              <tr key={s.item_id}>
                <td className="px-3 py-2 font-medium text-slate-900">{s.item_name}</td>
                <td className="px-3 py-2 text-right">
                  {s.required} {s.unit}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.available} {s.unit}
                  {!!s.reserved && s.reserved > 0 && (
                    <div className="text-[11px] text-slate-400">
                      {s.reserved} {s.unit} held for other orders
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-bold text-red-700">
                  {Math.round((s.required - s.available) * 1000) / 1000} {s.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {details.override_allowed ? (
          <>
            <Notice tone="warning">
              {mode === 'save'
                ? 'Overriding records the shortfall against your name and the reason you give. Only available stock is held; the rest is taken from whatever is free when work starts.'
                : 'Overriding records the shortfall against your name and the reason you give. Stock is taken down to zero — it never goes negative.'}
            </Notice>
            <div>
              <label className="field-label">Branch override password</label>
              <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" />
            </div>
            <div>
              <label className="field-label">Reason</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sheets received today, not yet entered"
                className="field-input"
              />
            </div>
          </>
        ) : (
          <Notice tone="info">Stock override is turned off for this branch. Request stock from another branch first.</Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
