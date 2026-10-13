import { useId } from 'react';

export default function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = 'logo-clip-' + useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" className={className} role="img" aria-label="Apodict">
      <defs>
        <clipPath id={id}>
          <rect transform="translate(59,26) rotate(-20)" x="-11" y="-6" width="22" height="68" rx="9" />
        </clipPath>
      </defs>
      <rect width="110" height="110" rx="24" fill="#4F46E5" />
      <g transform="translate(0,2.69)">
        <rect transform="translate(51,26) rotate(20)" x="-11" y="-6" width="22" height="68" rx="9" fill="#A5B4FC" />
        <rect transform="translate(59,26) rotate(-20)" x="-11" y="-6" width="22" height="68" rx="9" fill="#22D3EE" />
        <g clipPath={`url(#${id})`}>
          <rect transform="translate(51,26) rotate(20)" x="-11" y="-6" width="22" height="68" rx="9" fill="#fff" />
        </g>
        <rect x="40" y="62" width="30" height="11" rx="5.5" fill="#fff" />
      </g>
    </svg>
  );
}
