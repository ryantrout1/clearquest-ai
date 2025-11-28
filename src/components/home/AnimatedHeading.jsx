import React from 'react';
import { useScrollAnimation } from './useScrollAnimation.jsx';

export default function AnimatedHeading({ 
  children, 
  className = '',
  as: Tag = 'h2',
  delay = 0 
}) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });

  return (
    <Tag 
      ref={ref}
      className={`
        transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}