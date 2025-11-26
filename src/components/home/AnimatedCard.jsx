import React from 'react';
import { useScrollAnimation } from './useScrollAnimation';

export default function AnimatedCard({ 
  children, 
  className = '',
  delay = 0,
  hoverLift = true 
}) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });

  return (
    <div 
      ref={ref}
      className={`
        transition-all duration-400 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        ${hoverLift ? 'hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20' : ''}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}