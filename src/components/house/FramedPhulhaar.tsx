import React from 'react'

/**
 * Phulhaar's logo in the antique carved frame (the founder's brief, section 3). The frame drawing
 * is 600 by 720 with a carved border, so its opening sits 15.33 % in from the left and right and
 * 12.78 % from the top and bottom. The opening is Phulhaar's cream with a soft inner shadow, and
 * the logo sits in it with 6 % padding at the top, 7 % at the sides and 8 % at the bottom, with no
 * mount. The whole is at most 480 pixels wide, with a soft drop shadow.
 */
export const FramedPhulhaar: React.FC = () => (
  <div className="w-full max-w-[480px]">
    <div
      className="relative aspect-[600/720] w-full"
      style={{
        filter:
          'drop-shadow(0 18px 22px rgba(30,14,4,.28)) drop-shadow(0 3px 5px rgba(30,14,4,.2))',
      }}
    >
      <div
        className="absolute flex items-center justify-center"
        style={{
          inset: '12.78% 15.33%',
          background: 'var(--phulhaar-cream)',
          boxShadow: 'inset 3px 4px 10px rgba(20,8,2,.4)',
          padding: '6% 7% 8%',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the transparent logo file as given */}
        <img
          alt="Phulhaar Gallery logo"
          className="block h-auto w-full"
          height={259}
          src="/brand/phulhaar-logo.png"
          width={342}
        />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a vector frame, 44 KB compressed */}
      <img
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full"
        height={720}
        src="/brand/frame-royal-brown.svg"
        width={600}
      />
    </div>
  </div>
)
