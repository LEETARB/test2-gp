import React from 'react';
import logo from '../assets/itpc-logo.png';

const BrandLogo = ({ className = '', imageClassName = '', showRing = true }) => {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_rgba(49,46,129,0.18)] ${showRing ? 'ring-1 ring-indigo-100' : ''} ${className}`}
    >
      <img src={logo} alt="ITPC logo" className={`h-full w-full object-cover ${imageClassName}`} />
    </div>
  );
};

export default BrandLogo;
