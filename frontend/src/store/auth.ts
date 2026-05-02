import { create } from "zustand";

export type Role = "superadmin" | "admin" | "cliente" | "conductor";

type AuthState = {
  tenantSlug: string | null;
  setTenantSlug: (s: string | null) => void;
};

export const useAuthMeta = create<AuthState>((set) => ({
  tenantSlug: localStorage.getItem("tp_slug"),
  setTenantSlug: (s) => {
    if (s) localStorage.setItem("tp_slug", s);
    else localStorage.removeItem("tp_slug");
    set({ tenantSlug: s });
  },
}));
