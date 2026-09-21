'use client';
import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react';

export default function ShaderLayer({
  colors,
  animate,
  preserveBuffer,
}: {
  colors: readonly [string, string, string];
  animate: boolean;
  preserveBuffer?: boolean;
}) {
  return (
    <ShaderGradientCanvas
      pixelDensity={1}
      fov={45}
      pointerEvents="none"
      lazyLoad
      preserveDrawingBuffer={preserveBuffer}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ShaderGradient
        control="props"
        type="waterPlane"
        animate={animate ? 'on' : 'off'}
        uSpeed={0.1}
        uStrength={2.4}
        uDensity={1.1}
        uFrequency={5.5}
        color1={colors[0]}
        color2={colors[1]}
        color3={colors[2]}
        // '3d' lighting avoids fetching remote HDR environment maps (privacy + CSP friendly).
        lightType="3d"
        brightness={0.7}
        grain="off"
        reflection={0.1}
        cAzimuthAngle={180}
        cPolarAngle={90}
        cDistance={2.8}
        positionX={0}
        positionY={0}
        positionZ={0}
        rotationX={50}
        rotationY={0}
        rotationZ={-60}
      />
    </ShaderGradientCanvas>
  );
}
