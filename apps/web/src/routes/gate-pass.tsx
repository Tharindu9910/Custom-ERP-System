import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { DEFAULT_BRANCH_SETTINGS, Role } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { usePermission } from '@/shared/hooks/usePermission';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { GatePassSearch } from '@/app/search-params';
import { GatePassCreateForm } from '@/modules/gate-passes/components/GatePassCreateForm';
import { GatePassDetailsModal } from '@/modules/gate-passes/components/GatePassDetailsModal';
import { GatePassQueue } from '@/modules/gate-passes/components/GatePassQueue';
import type { GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';

export function GatePassPage() {
  const search = useSearch({ strict: false }) as GatePassSearch;
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const { can } = usePermission();
  const { settings, hasRoofing, hasWorkshop } = useBranchContext();
  const [tab, setTab] = useState<'create' | 'queue'>(search.tab ?? 'create');
  const [selected, setSelected] = useState<GatePassDto | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const gpSettings = settings?.gate_pass ?? DEFAULT_BRANCH_SETTINGS.gate_pass;

  // Workshop-only branches don't track colour for Supervisor & Chief (prototype rule)
  const hideColor = hasWorkshop && !hasRoofing && (role === Role.SUPERVISOR || role === Role.CHIEF);
  const canTransact = useCanTransact();
  const canCreate = canTransact && can('create', 'gate_pass');

  const goToJobCard = (gp: GatePassDto) => void navigate({ to: '/job-cards/new', search: { gatePass: gp.gate_pass_id } });
  const goToOrder = (gp: GatePassDto) => void navigate({ to: '/orders/new', search: { gatePass: gp.gate_pass_id } });

  const onCreated = (gp: GatePassDto) => {
    if (search.return_to === 'job-card') return goToJobCard(gp);
    if (search.return_to === 'order') return goToOrder(gp);
    setCreated(gp.pass_number);
    setTab('queue');
  };

  const tabCls = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition-all ${
      active ? 'border-[#0033A0] bg-white text-[#0033A0]' : 'border-transparent text-slate-500 hover:bg-slate-100/60 hover:text-slate-800'
    }`;

  return (
    <div className="mx-auto mb-10 max-w-5xl">
      {search.return_to && (
        <Notice tone="info" className="mb-4">
          Record the customer's material, then you'll go straight back to the {search.return_to === 'job-card' ? 'job card' : 'order form'} with this
          gate pass linked.
        </Notice>
      )}
      {created && (
        <Notice tone="success" className="mb-4">
          Gate pass <strong>#{created}</strong> created.
        </Notice>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex border-b border-slate-200 bg-slate-50/70">
          {canCreate && (
            <button type="button" onClick={() => setTab('create')} className={tabCls(tab === 'create')}>
              <Icon name="plus" />
              <span>Create Gate Pass</span>
            </button>
          )}
          <button type="button" onClick={() => setTab('queue')} className={tabCls(tab === 'queue' || !canCreate)}>
            <Icon name="search" />
            <span>Gate Pass Queue</span>
          </button>
        </div>

        {tab === 'create' && canCreate ? (
          <GatePassCreateForm
            materials={gpSettings.materials}
            colors={gpSettings.colors}
            hideColor={hideColor}
            initialPhone={search.phone}
            initialName={search.name}
            onCreated={onCreated}
          />
        ) : (
          <GatePassQueue onOpen={setSelected} />
        )}
      </div>

      {selected && (
        <GatePassDetailsModal
          gatePass={selected}
          hideColor={hideColor}
          canAllocateJobCard={canTransact && hasWorkshop && can('create', 'job_card')}
          // Who may use a pass on a roofing order is set on Role Permissions (allocate:gate_pass_order)
          canAllocateOrder={canTransact && hasRoofing && can('create', 'roofing_order') && can('allocate', 'gate_pass_order')}
          onAllocateJobCard={goToJobCard}
          onAllocateOrder={goToOrder}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
