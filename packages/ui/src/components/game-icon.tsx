import { Crosshair, Gamepad2, Shield, Swords, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  crosshair: Crosshair,
  target: Target,
  swords: Swords,
  shield: Shield,
  zap: Zap,
  trophy: Trophy,
};

export function GameIcon({ icon, className }: { icon: string; className?: string }) {
  const I = ICONS[icon] ?? Gamepad2;
  return <I className={className} aria-hidden="true" />;
}
