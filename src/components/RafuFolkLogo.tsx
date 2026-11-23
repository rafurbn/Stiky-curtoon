import type { LogoStyle } from '../types/comic';

interface RafuFolkLogoProps {
  text?: string;
  styleVariant?: LogoStyle;
  size?: 'sm' | 'md' | 'lg';
}

export function RafuFolkLogo({
  text = '@@RAFU FOLK@@',
  styleVariant = 'stamp-dark',
  size = 'md',
}: RafuFolkLogoProps) {
  const scaleClass =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs'
      : size === 'lg'
        ? 'px-5 py-2.5 text-lg'
        : 'px-3.5 py-1.5 text-sm';

  if (styleVariant === 'comic-badge') {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-lg border-2 border-slate-900 bg-white font-display font-extrabold tracking-tight text-slate-900 shadow-[2px_2px_0_#0f172a] whitespace-nowrap shrink-0 ${scaleClass}`}
      >
        <svg
          width={size === 'sm' ? 16 : 20}
          height={size === 'sm' ? 16 : 20}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.5" stroke="#0F172A" strokeWidth="2.2" fill="#FEF08A" />
          <circle cx="9" cy="10.5" r="1.4" fill="#0F172A" />
          <circle cx="15" cy="10.5" r="1.4" fill="#0F172A" />
          <path
            d="M8.5 14.5C9.5 16.2 14.5 16.2 15.5 14.5"
            stroke="#0F172A"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>{text}</span>
      </span>
    );
  }

  if (styleVariant === 'minimal-mono') {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 font-mono-tabular font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 ${scaleClass}`}
      >
        <span>{text}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 border-2 border-slate-900 bg-slate-900 font-display font-extrabold tracking-tight text-white shadow-[3px_3px_0_#facc15] whitespace-nowrap shrink-0 ${scaleClass}`}
    >
      <svg
        width={size === 'sm' ? 16 : 20}
        height={size === 'sm' ? 16 : 20}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" stroke="#FACC15" strokeWidth="2.2" />
        <circle cx="9" cy="10.5" r="1.4" fill="#FACC15" />
        <circle cx="15" cy="10.5" r="1.4" fill="#FACC15" />
        <path
          d="M8.5 14.5C9.5 16.2 14.5 16.2 15.5 14.5"
          stroke="#FACC15"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span>{text}</span>
    </span>
  );
}
