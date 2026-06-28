import { useState } from 'react';
import { Role } from '@erp/shared';
import { PageHeader } from '@/shared/components/PageHeader';
import {
  useAllPermissions,
  usePermissionsMatrix,
  useUpdateRolePermissions,
  type PermissionDef,
} from '../hooks/usePermissionsMatrix';

const DISPLAY_ROLES: Role[] = [
  Role.ADMIN, Role.AUDITOR, Role.SUPERVISOR, Role.CHIEF, Role.CASHIER, Role.MANAGER,
];

export function PermissionsMatrix() {
  const { data: allPerms = [], isLoading: permsLoading } = useAllPermissions();
  const { data: matrix = [], isLoading: matrixLoading } = usePermissionsMatrix();
  const updateRole = useUpdateRolePermissions();

  // Local editable state: Map<role, Set<permission_id>>
  const [grants, setGrants] = useState<Map<Role, Set<string>> | null>(null);
  const [saving, setSaving] = useState<Role | null>(null);

  // Initialise from server data on first load
  const effectiveGrants: Map<Role, Set<string>> = grants ?? (() => {
    const m = new Map<Role, Set<string>>();
    for (const row of matrix) {
      m.set(row.role, new Set(row.permissions.filter((p) => p.granted).map((p) => p.permission_id)));
    }
    return m;
  })();

  const toggle = (role: Role, permId: string) => {
    const next = new Map(effectiveGrants);
    const set = new Set(next.get(role) ?? []);
    if (set.has(permId)) set.delete(permId);
    else set.add(permId);
    next.set(role, set);
    setGrants(next);
  };

  const saveRole = async (role: Role) => {
    setSaving(role);
    const grantedIds = effectiveGrants.get(role) ?? new Set<string>();
    const updates = allPerms.map((p) => ({
      permission_id: p.permission_id,
      granted: grantedIds.has(p.permission_id),
    }));
    try {
      await updateRole.mutateAsync({ role, updates });
    } finally {
      setSaving(null);
    }
  };

  // Group permissions by module
  const byModule = allPerms.reduce<Record<string, PermissionDef[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  if (permsLoading || matrixLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <PageHeader title="Role Permissions" />
      <p className="mb-4 text-sm text-gray-500">
        SUPER_ADMIN always has full access — not shown here.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-56 px-4 py-3 text-left">Permission</th>
              {DISPLAY_ROLES.map((r) => (
                <th key={r} className="px-3 py-3 text-center">
                  <div>{r.replace('_', ' ')}</div>
                  <button
                    className="mt-1 rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-40"
                    onClick={() => saveRole(r)}
                    disabled={saving === r || updateRole.isPending}
                  >
                    {saving === r ? 'Saving…' : 'Save'}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(byModule).map(([mod, perms]) => (
              <>
                <tr key={`mod-${mod}`} className="bg-gray-50">
                  <td
                    colSpan={DISPLAY_ROLES.length + 1}
                    className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"
                  >
                    {mod}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.permission_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">
                      <span className="font-mono text-xs text-gray-500">{p.action}</span>
                      {p.description && (
                        <p className="text-xs text-gray-400">{p.description}</p>
                      )}
                    </td>
                    {DISPLAY_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          checked={effectiveGrants.get(role)?.has(p.permission_id) ?? false}
                          onChange={() => toggle(role, p.permission_id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}