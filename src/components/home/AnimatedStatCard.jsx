import React from 'react';
import { useScrollAnimation, useCountUp } from './useScrollAnimation.jsx';

export default function AnimatedStatCard({ number, label }) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.3 });
  
  // Determine if the number is countable
  const isNumeric = typeof number === 'number' || /^\d+$/.test(number);
  const numericValue = isNumeric ? (typeof number === 'number' ? number : parseInt(number)) : null;
  
  const count = useCountUp(numericValue || 0, 1200, isVisible);
  
  // Format display value
  const displayValue = isNumeric ? count : number;

  return (
    <div 
      ref={ref}
      className={`
        space-y-1 sm:space-y-2
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <div className="text-2xl sm:text-4xl md:text-5xl font-bold text-blue-400">
        {displayValue}
      </div>
      <div className="text-slate-400 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider leading-tight">
        {label}
      </div>
    </div>
  );
}