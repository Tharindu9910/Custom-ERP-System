import { useEffect, useState } from 'react';
import { FormField } from '@/shared/components/FormField';
import { useBranches, useBranchConfig, useUpdateBranchConfig } from '../hooks/useBranches';
import { useAuthStore } from '@/shared/stores/auth.store';

export function BranchConfigPanel() {
  const { user } = useAuthStore();
  const { data: branches = [] } = useBranches();

  // SUPER_ADMIN / MANAGER (branch_id null) can pick any branch; others see only their own.
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  useEffect(() => {
    if (!selectedBranchId) {
      const defaultId = user?.branch_id ?? branches[0]?.branch_id ?? '';
      setSelectedBranchId(defaultId);
    }
  }, [branches, user?.branch_id, selectedBranchId]);

  const { data: config, isLoading } = useBranchConfig(selectedBranchId);
  const update = useUpdateBranchConfig(selectedBranchId);

  const [minAdvCustomized, setMinAdvCustomized] = useState(30);
  const [minAdvStandard, setMinAdvStandard] = useState(0);
  const [stockOverrideEnabled, setStockOverrideEnabled] = useState(false);
  const [stockOverridePassword, setStockOverridePassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (config) {
      setMinAdvCustomized(config.min_advance_pct_customized);
      setMinAdvStandard(config.min_advance_pct_standard);
      setStockOverrideEnabled(config.stock_override_enabled);
      setStockOverridePassword('');
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await update.mutateAsync({
        min_advance_pct_customized: minAdvCustomized,
        min_advance_pct_standard: minAdvStandard,
        stock_override_enabled: stockOverrideEnabled,
        stock_override_password: stockOverridePassword || undefined,
      });
      setSaved(true);
      setStockOverridePassword('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'An error occurred';
      setError(msg);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">Branch Configuration</h1>

      {/* Branch selector for cross-branch users */}
      {user?.branch_id === null && branches.length > 0 && (
        <FormField label="Branch">
          <select
            className="input"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading config…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <FormField label="Min Advance % — Customized Orders">
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={minAdvCustomized}
              onChange={(e) => setMinAdvCustomized(Number(e.target.value))}
            />
          </FormField>

          <FormField label="Min Advance % — Standard Orders">
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={minAdvStandard}
              onChange={(e) => setMinAdvStandard(Number(e.target.value))}
            />
          </FormField>

          <FormField label="Stock Override">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stockOverrideEnabled}
                onChange={(e) => setStockOverrideEnabled(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Allow stock override with password</span>
            </label>
          </FormField>

          {stockOverrideEnabled && (
            <FormField label="Override Password (leave blank to keep current)">
              <input
                type="password"
                className="input"
                value={stockOverridePassword}
                onChange={(e) => setStockOverridePassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Configuration saved.</p>}

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}