import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/shared/stores/auth.store';
import { apiClient } from '@/shared/api/client';
import { apiError } from '@/shared/api/errors';
import { env } from '@/env';
import type { AuthUser } from '@/shared/stores/auth.store';
import { Role } from '@erp/shared';

const schema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

type Fields = z.infer<typeof schema>;

// Dev-only quick login — mirrors BRANCHES / USERS in apps/api/src/database/seeds/seed.ts.
// Branch users are seeded as <role>_<branch key> with one dev password.
const DEV_BRANCHES = [
  { id: '00000000-0000-0000-0000-000000000001', key: 'naiwala', name: 'Naiwala', type: 'Roofing' },
  { id: '00000000-0000-0000-0000-000000000002', key: 'veyangoda', name: 'Veyangoda', type: 'Workshop' },
  { id: '00000000-0000-0000-0000-000000000003', key: 'thangalla', name: 'Thangalla', type: 'Roofing + Workshop' },
] as const;
const DEV_BRANCH_PASSWORD = 'Dev@1234';
// Global (head-office) roles have one account each and start on "All branches"
const DEV_GLOBAL: Partial<Record<Role, { username: string; password: string }>> = {
  [Role.SUPER_ADMIN]: { username: 'superadmin', password: 'Super@123' },
  [Role.ADMIN]: { username: 'admin', password: 'Admin@123' },
  [Role.AUDITOR]: { username: 'auditor1', password: 'Auditor@123' },
};
const DEV_ROLES: { role: Role; label: string }[] = [
  { role: Role.SUPER_ADMIN, label: 'Super Admin' },
  { role: Role.ADMIN, label: 'Admin' },
  { role: Role.AUDITOR, label: 'Auditor' },
  { role: Role.MANAGER, label: 'Branch Manager' },
  { role: Role.SUPERVISOR, label: 'Supervisor' },
  { role: Role.CHIEF, label: 'Chief' },
  { role: Role.CASHIER, label: 'Cashier' },
];

function devCredentials(role: Role, branchKey: string) {
  return DEV_GLOBAL[role] ?? { username: `${role.toLowerCase()}_${branchKey}`, password: DEV_BRANCH_PASSWORD };
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [devBranch, setDevBranch] = useState<string>(DEV_BRANCHES[0].key);
  const [devRole, setDevRole] = useState<Role>(Role.SUPERVISOR);
  const [quickBusy, setQuickBusy] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({ resolver: zodResolver(schema) });

  const handleQuickLogin = async () => {
    const branch = DEV_BRANCHES.find((b) => b.key === devBranch);
    if (!branch) return;
    const creds = devCredentials(devRole, branch.key);
    setValue('username', creds.username);
    setValue('password', creds.password);
    setQuickBusy(true);
    await onSubmit(creds);
    setQuickBusy(false);
  };

  const onSubmit = async (values: Fields) => {
    setServerError(null);
    try {
      const { data } = await apiClient.post<{
        data: { accessToken: string; refreshToken: string; user: AuthUser };
      }>('/auth/login', values);
      const { accessToken, refreshToken, user } = data.data;
      setTokens(accessToken, refreshToken);
      setUser(user);
      void navigate({ to: user.must_change_password ? '/change-password' : '/' });
    } catch (err: unknown) {
      setServerError(apiError(err).message || 'Login failed. Check your credentials.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-2xl font-semibold text-gray-900">
          {env.APP_NAME}
        </h1>
        <p className="mb-6 text-sm text-gray-500">Sign in to continue</p>

        {import.meta.env.DEV && (
          <div className="mb-6 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">Quick login (dev only)</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="quick-branch" className="block text-[11px] font-medium text-amber-700">
                  Branch
                </label>
                <select
                  id="quick-branch"
                  value={devBranch}
                  onChange={(e) => setDevBranch(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-sm text-gray-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {DEV_BRANCHES.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.name} ({b.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quick-role" className="block text-[11px] font-medium text-amber-700">
                  Role
                </label>
                <select
                  id="quick-role"
                  value={devRole}
                  onChange={(e) => setDevRole(e.target.value as Role)}
                  className="mt-0.5 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-sm text-gray-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {DEV_ROLES.map((r) => (
                    <option key={r.role} value={r.role}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] text-amber-700">
              {devCredentials(devRole, devBranch).username}
            </p>
            <button
              type="button"
              disabled={quickBusy || isSubmitting}
              onClick={() => void handleQuickLogin()}
              className="mt-2 w-full rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {quickBusy ? 'Signing in…' : 'Quick sign in'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit((values) => onSubmit(values))} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              {...register('username')}
              className="mt-1 w-full rounded-lg border text-gray-700 border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="mt-1 w-full rounded-lg border text-gray-700 border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}