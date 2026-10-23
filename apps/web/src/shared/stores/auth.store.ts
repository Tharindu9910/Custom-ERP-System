import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@erp/shared';
import { clearAllFormDrafts } from '@/shared/hooks/useFormDraft';

export interface AuthUser {
  user_id: string;
  username: string;
  name: string;
  role: Role;
  branch_id: string | null;
  permissions: string[];
  /** Signed in with a temporary password — must change it before anything else. */
  must_change_password?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Resolved branch context. Equals user.branch_id for scoped roles.
   *  For cross-branch roles (SUPER_ADMIN, MANAGER) this is set via the branch picker. */
  activeBranchId: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  setActiveBranchId: (id: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      activeBranchId: null,
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) =>
        set((state) => ({
          user,
          // Scoped roles: lock to their JWT branch — override any prior selection.
          // Cross-branch roles (branch_id null): keep whatever was previously selected.
          activeBranchId: user.branch_id ?? state.activeBranchId,
        })),
      setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
      logout: () => {
        // Half-filled forms hold customer details: never leave them for the next login
        clearAllFormDrafts();
        set({ user: null, accessToken: null, refreshToken: null, activeBranchId: null });
      },
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        activeBranchId: state.activeBranchId,
      }),
    },
  ),
);