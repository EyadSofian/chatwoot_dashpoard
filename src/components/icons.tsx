import {
  LayoutDashboard,
  Users,
  UsersRound,
  Building2,
  MessagesSquare,
  Megaphone,
  Gauge,
  Bot,
  Download,
  Settings,
  Tags,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UsersRound,
  Building2,
  MessagesSquare,
  Megaphone,
  Gauge,
  Bot,
  Download,
  Settings,
  Tags,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? LayoutDashboard;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
