import { ICONS } from '../data/icons';

/** Иконка game-icons.net; цвет берётся из CSS (currentColor). */
export function Icon({ name, size = 24, className }: { name?: string; size?: number; className?: string }) {
  const body = name ? ICONS[name] : undefined;
  if (!body) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
