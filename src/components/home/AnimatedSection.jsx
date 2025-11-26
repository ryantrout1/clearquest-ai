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
    subtle1: 'bg-transparent',
    subtle2: 'bg-transparent',
    dark: 'bg-slate-800/50 backdrop-blur-sm',
    darkBlend: 'bg-gradient-to-b from-slate-800/30 via-slate-800/40 to-slate-800/30',
    accent: 'bg-slate-900/80',
    accentBlend: 'bg-gradient-to-b from-transparent via-slate-900/60 to-transparent'
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