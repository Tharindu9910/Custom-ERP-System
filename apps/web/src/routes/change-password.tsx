import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChangePasswordSchema, PASSWORD_RULES } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { apiClient } from '@/shared/api/client';
import { apiError } from '@/shared/api/errors';
import { useAuthStore, type AuthUser } from '@/shared/stores/auth.store';
import { env } from '@/env';

/**
 * Change Your Password (prototype). Required after signing in with a temporary
 * password; the server allows nothing else until it is done.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, setTokens, setUser, logout } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Passwords do not match.');
    const parsed = ChangePasswordSchema.safeParse({ current_password: current, new_password: password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? PASSWORD_RULES);
    setSaving(true);
    try {
      const { data } = await apiClient.post<{ data: { accessToken: string; refreshToken: string; user: AuthUser } }>('/auth/change-password', parsed.data);
      setTokens(data.data.accessToken, data.data.refreshToken);
      setUser(data.data.user);
      void navigate({ to: '/' });
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      /* best effort */
    }
    logout();
    void navigate({ to: '/login' });
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative mt-1">
        <input
          type={show ? 'text' : 'password'}
          required
          autoComplete={auto}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 font-sans sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <p className="text-center text-sm font-semibold text-slate-500">{env.APP_NAME}</p>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-gray-900">Change Your Password</h2>
        {user?.must_change_password && (
          <p className="mt-2 text-center text-sm text-gray-500">You signed in with a temporary password. Choose your own to continue.</p>
        )}
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-gray-200 bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={submit}>
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {field(user?.must_change_password ? 'Temporary Password' : 'Current Password', current, setCurrent, 'current-password')}
            <div>
              {field('New Password', password, setPassword, 'new-password')}
              <p className="mt-2 text-xs text-gray-500">{PASSWORD_RULES}</p>
            </div>
            {field('Re-enter Password', confirm, setConfirm, 'new-password')}
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <Icon name="eye" className="h-3.5 w-3.5" /> Show passwords
            </label>
            <div className="space-y-3">
              <button
                type="submit"
                disabled={saving}
                className="flex w-full justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Change Password'}
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
