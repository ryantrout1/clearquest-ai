import React from 'react';
import { useScrollAnimation } from './useScrollAnimation';

export default function AnimatedSection({ 
  children, 
  className = '', 
  transitionLine = null,
  bgStyle = 'default',
  id = null 
}) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05 });

  const bgStyles = {
    default: 'bg-transparent',
    none: 'bg-transparent',
    subtle1: 'bg-[radial-gradient(ellipse_at_top,_rgba(30,96,212,0.08)_0%,_transparent_50%)]',
    subtle2: 'bg-[radial-gradient(ellipse_at_bottom,_rgba(109,93,210,0.06)_0%,_transparent_50%)]',
    dark: 'bg-[#0C234A]/60 backdrop-blur-sm',
    darkBlend: 'bg-gradient-to-b from-[#102B57]/40 via-[#0C234A]/50 to-[#102B57]/40',
    accent: 'bg-[#0B1F3F]/80',
    accentBlend: 'bg-gradient-to-b from-transparent via-[#102B57]/50 to-transparent',
    glowTop: 'bg-[radial-gradient(ellipse_at_top_center,_rgba(30,96,212,0.12)_0%,_transparent_60%)]',
    glowBottom: 'bg-[radial-gradient(ellipse_at_bottom_center,_rgba(109,93,210,0.1)_0%,_transparent_60%)]'
  };

  return (
    <section 
      ref={ref}
      id={id}
      className={`relative ${bgStyles[bgStyle] || bgStyles.default} ${className}`}
    >

      
      <div className={`
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}>
        {transitionLine && (
          <p className={`
            text-center text-sm sm:text-base text-white/60 mb-4 sm:mb-6 px-4
            transition-all duration-400 delay-100
            ${isVisible ? 'opacity-70 translate-y-0' : 'opacity-0 translate-y-2'}
          `}>
            {transitionLine}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}