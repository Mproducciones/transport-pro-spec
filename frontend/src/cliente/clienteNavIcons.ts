import type { LucideIcon } from "lucide-react";
import { CreditCard, History, LayoutDashboard, LifeBuoy, MapIcon, Package, Receipt } from "lucide-react";
import type { ClienteNavIconKey } from "./clienteNavConfig.js";

export const CLIENTE_NAV_ICONS: Record<ClienteNavIconKey, LucideIcon> = {
  LayoutDashboard,
  Package,
  Map: MapIcon,
  History,
  Receipt,
  CreditCard,
  LifeBuoy,
};
