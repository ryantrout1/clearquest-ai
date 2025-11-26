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
    subtle1: 'bg-gradient-to-b from-[#0A1A3D]/0 via-[#0E244F]/30 to-[#0A1A3D]/0',
    subtle2: 'bg-gradient-to-b from-[#0E244F]/0 via-[#0A1A3D]/40 to-[#0E244F]/0',
    dark: 'bg-slate-800/50 backdrop-blur-sm',
    accent: 'bg-slate-900/80'
  };

  return (
    <section 
      ref={ref}
      id={id}
      className={`relative ${bgStyles[bgStyle] || bgStyles.default} ${className}`}
    >
      {/* Soft top separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700/30 to-transparent" />
      
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