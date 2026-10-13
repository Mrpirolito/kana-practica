'use client';
import clsx from 'clsx';
import type { NameEffect } from '../lib/profile';

interface StyledNameProps {
  name: string;
  color: string;
  color2: string;
  effect: NameEffect;
  className?: string;
}

// Decorative name styles (gradient, rainbow, glow, sparkle, shimmer)
export default function StyledName({ name, color, color2, effect, className }: StyledNameProps) {
  const vars = { '--n1': color, '--n2': color2 } as React.CSSProperties;
  return (
    <span className={clsx('styled-name relative inline-block font-bold', `fx-${effect}`, className)} style={vars}>
      {name}
      {effect === 'sparkle' && (
        <span aria-hidden className='fx-stars'>
          <i>✦</i>
          <i>✧</i>
          <i>✦</i>
          <i>✧</i>
        </span>
      )}
      <style>{`
.styled-name{color:var(--n1)}
.fx-gradient,.fx-rainbow,.fx-shimmer{background-clip:text;-webkit-background-clip:text;color:transparent}
.fx-gradient{background-image:linear-gradient(90deg,var(--n1),var(--n2))}
.fx-rainbow{background-image:linear-gradient(90deg,#ff5e5e,#ffb84d,#fff35c,#5eff8f,#5ec8ff,#b26bff,#ff5e5e);background-size:200% auto;animation:fx-slide 3s linear infinite}
.fx-shimmer{background-image:linear-gradient(110deg,var(--n1) 35%,#fff 50%,var(--n1) 65%);background-size:250% auto;animation:fx-slide 2.5s linear infinite}
.fx-glow{text-shadow:0 0 6px var(--n1),0 0 14px var(--n2);animation:fx-pulse 2s ease-in-out infinite}
.fx-sparkle{background-image:linear-gradient(90deg,var(--n1),var(--n2));background-clip:text;-webkit-background-clip:text;color:transparent}
.fx-stars{position:absolute;inset:-6px -10px;pointer-events:none}
.fx-stars i{position:absolute;font-style:normal;font-size:.55em;color:var(--n2);animation:fx-twinkle 1.6s ease-in-out infinite}
.fx-stars i:nth-child(1){top:0;left:0}
.fx-stars i:nth-child(2){top:10%;right:0;animation-delay:.4s;color:var(--n1)}
.fx-stars i:nth-child(3){bottom:0;left:40%;animation-delay:.8s}
.fx-stars i:nth-child(4){bottom:15%;right:20%;animation-delay:1.2s;color:var(--n1)}
@keyframes fx-slide{to{background-position:-200% center}}
@keyframes fx-pulse{50%{text-shadow:0 0 12px var(--n1),0 0 24px var(--n2)}}
@keyframes fx-twinkle{0%,100%{opacity:0;transform:scale(.5) rotate(0)}50%{opacity:1;transform:scale(1.2) rotate(45deg)}}
@media (prefers-reduced-motion:reduce){.styled-name,.styled-name *{animation:none!important}}
`}</style>
    </span>
  );
}
