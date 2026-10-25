import { Fragment, useMemo, useState } from 'react';
import { PERMISSION_BY_ACTION, Role, permissionGrantBlock } from '@erp/shared';
import { PageHeader } from '@/shared/components/PageHeader';
import { Notice } from '@/shared/components/Notice';
import { apiError } from '@/shared/api/errors';
import {
  useAllPermissions,
  usePermissionsMatrix,
  useUpdateRolePermissions,
  type PermissionDef,
} from '../hooks/usePermissionsMatrix';

const DISPLAY_ROLES: Role[] = [
  Role.ADMIN, Role.AUDITOR, Role.SUPERVISOR, Role.CHIEF, Role.CASHIER, Role.MANAGER,
];

const GLOBAL_VIEW_ONLY_HINT = 'Head office is view-only on branch work, so this would have no effect';

/** Access decided by role in code, not by this page — listed so nobody looks for them in the matrix. */
const FIXED_ROLE_RULES: { rule: string; why: string }[] = [
  { rule: 'SUPER_ADMIN passes every permission check and is the only role that can open this page.', why: 'Keeps someone able to undo any change made here.' },
  { rule: 'ADMIN and AUDITOR have no home branch and only view branch work (no creating, starting or paying).', why: 'Head-office scope (decision 0002).' },
  { rule: 'Only a Super Admin can give someone the SUPER_ADMIN role.', why: 'Stops privilege escalation through Users.' },
  { rule: 'A CHIEF cannot change, start, complete or void an order a SUPERVISOR created while that supervisor is active.', why: 'BR21 chief deference.' },
  { rule: 'Supervisors and chiefs at workshop-only branches are not asked for colour on gate passes.', why: 'Prototype rule.' },
];

type Edits = Map<Role, Map<string, boolean>>;

export function PermissionsMatrix() {
  const { data: allPerms = [], isLoading: permsLoading } = useAllPermissions();
  const { data: matrix = [], isLoading: matrixLoading } = usePermissionsMatrix();
  const updateRole = useUpdateRolePermissions();

  // Unsaved ticks per role, on top of what the server has
  const [edits, setEdits] = useState<Edits>(new Map());
  const [saving, setSaving] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serverGrants = useMemo(() => {
    const m = new Map<Role, Set<string>>();
    for (const row of matrix) {
      m.set(row.role, new Set(row.permissions.filter((p) => p.granted).map((p) => p.permission_id)));
    }
    return m;
  }, [matrix]);

  const isGranted = (role: Role, permId: string) =>
    edits.get(role)?.get(permId) ?? serverGrants.get(role)?.has(permId) ?? false;

  const toggle = (role: Role, permId: string) => {
    const next = new Map(edits);
    const roleEdits = new Map(next.get(role) ?? []);
    const value = !isGranted(role, permId);
    // Back to what the server has: no longer an edit
    if (value === (serverGrants.get(role)?.has(permId) ?? false)) roleEdits.delete(permId);
    else roleEdits.set(permId, value);
    next.set(role, roleEdits);
    setEdits(next);
  };

  const discard = (role: Role) => {
    const next = new Map(edits);
    next.delete(role);
    setEdits(next);
  };

  const saveRole = async (role: Role) => {
    const roleEdits = edits.get(role);
    if (!roleEdits || roleEdits.size === 0) return;
    setSaving(role);
    setError(null);
    try {
      await updateRole.mutateAsync({
        role,
        updates: [...roleEdits].map(([permission_id, granted]) => ({ permission_id, granted })),
      });
      discard(role);
    } catch (err) {
      setError(`${role}: ${apiError(err).message}`);
    } finally {
      setSaving(null);
    }
  };

  // Group permissions by module; configure:permissions belongs to the Super Admin alone
  const byModule = allPerms
    .filter((p) => permissionGrantBlock(Role.MANAGER, p.action) !== 'SUPER_ADMIN_ONLY')
    .reduce<Record<string, PermissionDef[]>>((acc, p) => {
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
      <div className="mb-4 space-y-1 text-sm text-gray-500">
        <p>SUPER_ADMIN always has full access — not shown here.</p>
        <p>
          Changes apply as soon as you save: signed-in users' menus and the server follow at once.
          Rows tagged <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">Not used yet</span> are
          ready for screens that aren't built, so ticking them changes nothing today.
        </p>
      </div>

      {error && <Notice tone="error" className="mb-4">{error}</Notice>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-72 px-4 py-3 text-left">Permission</th>
              {DISPLAY_ROLES.map((r) => {
                const dirty = (edits.get(r)?.size ?? 0) > 0;
                return (
                  <th key={r} className="px-3 py-3 text-center align-top">
                    <div>{r.replace('_', ' ')}</div>
                    <div className="mt-1 flex flex-col items-center gap-1">
                      <button
                        className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700 disabled:opacity-40"
                        onClick={() => void saveRole(r)}
                        disabled={!dirty || saving === r || updateRole.isPending}
                      >
                        {saving === r ? 'Saving…' : 'Save'}
                      </button>
                      {dirty && saving !== r && (
                        <button className="text-[10px] normal-case text-gray-500 underline hover:text-gray-700" onClick={() => discard(r)}>
                          Discard ({edits.get(r)!.size})
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(byModule).map(([mod, perms]) => (
              <Fragment key={mod}>
                <tr className="bg-gray-50">
                  <td
                    colSpan={DISPLAY_ROLES.length + 1}
                    className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"
                  >
                    {mod}
                  </td>
                </tr>
                {perms.map((p) => {
                  const planned = PERMISSION_BY_ACTION[p.action]?.status === 'planned';
                  return (
                    <tr key={p.permission_id} className={planned ? 'bg-gray-50/50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2 text-gray-700">
                        <span className={`font-mono text-xs ${planned ? 'text-gray-400' : 'text-gray-500'}`}>{p.action}</span>
                        {planned && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                            Not used yet
                          </span>
                        )}
                        {p.description && <p className="text-xs text-gray-400">{p.description}</p>}
                      </td>
                      {DISPLAY_ROLES.map((role) => {
                        const granted = isGranted(role, p.permission_id);
                        // A stale grant stays visible so it can be removed; it just can't be added
                        const blocked = !granted && permissionGrantBlock(role, p.action) === 'GLOBAL_VIEW_ONLY';
                        const edited = edits.get(role)?.has(p.permission_id);
                        return (
                          <td key={role} className={`px-3 py-2 text-center ${edited ? 'bg-amber-50' : ''}`} title={blocked ? GLOBAL_VIEW_ONLY_HINT : undefined}>
                            <input
                              type="checkbox"
                              aria-label={`${role} ${p.action}`}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              checked={granted}
                              disabled={blocked}
                              onChange={() => toggle(role, p.permission_id)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-medium text-gray-700">Fixed role rules (not controlled here)</summary>
        <ul className="mt-3 space-y-2">
          {FIXED_ROLE_RULES.map((r) => (
            <li key={r.rule} className="text-gray-600">
              {r.rule} <span className="text-xs text-gray-400">— {r.why}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
