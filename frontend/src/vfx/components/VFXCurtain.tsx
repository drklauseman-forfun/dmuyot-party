import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CurtainParams } from '../types';
import { useFadeClock } from './fadeClock';

/**
 * A silk curtain on a rod: hung over the results box, or across the whole
 * screen, falling into place and swaying once it has.
 *
 * The first curtain was a dark rectangle with faint stripes and was not taken
 * for a curtain at all. What makes one read is the folds catching the light —
 * so these are shaded properly, from a surface that rises and falls across
 * the cloth, with silk's sheen running down every crest — plus a hem that
 * follows the folds and a rod for it all to hang from.
 *
 * Painted over the frame rather than added to it, so black works; the sheen
 * is a lighter version of the cloth's own colour, so black silk shines silver
 * and red silk pink. Not quite opaque, and thicker in the troughs of the folds
 * than on their crests, as sheer cloth is: whatever it covers still shows.
 */

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform float time;
  uniform float drop;
  uniform float folds;
  uniform float opacity;
  uniform float rising;
  uniform float rodBand;
  uniform float aspect;
  uniform float sheen;
  uniform vec3 color;
  uniform vec3 sheenColor;

  const float TAU = 6.2831853;

  /**
   * How far the cloth comes forward at each point across it: a few waves of
   * different lengths, so the folds are uneven, as hung cloth is, drifting
   * slowly as silk does.
   */
  float surface(float x, float t) {
    float f = folds * TAU;
    // Mostly one long wave: silk drapes in broad, soft folds. A strong short
    // wave on top made it a pleated blind.
    return 0.72 * sin(x * f + t * 0.7)
         + 0.12 * sin(x * f * 2.13 + 1.3 - t * 0.45)
         + 0.16 * sin(x * f * 0.47 + 0.6 + t * 0.3);
  }

  void main() {
    // Measured down from the rod; a rising curtain has no rod and comes up.
    float down = rising > 0.5 ? vUv.y : 1.0 - vUv.y;
    float band = rising > 0.5 ? 0.0 : rodBand;

    if (rising < 0.5) {
      // A knob at each end of the rod, kept round whatever the curtain's
      // shape by measuring across in units of its height.
      float r = band * 1.1;
      float dy = down - band * 0.5;
      float d = min(length(vec2(vUv.x * aspect - r, dy)), length(vec2((1.0 - vUv.x) * aspect - r, dy)));
      if (d < r) {
        float dome = 1.0 - d / r;
        vec3 knob = vec3(0.79, 0.62, 0.29) * (0.45 + 0.6 * dome) + vec3(1.0, 0.95, 0.8) * pow(dome, 5.0) * 0.6;
        gl_FragColor = vec4(knob, opacity);
        #include <colorspace_fragment>
        return;
      }
    }

    if (down < band) {
      // A brass rod, round in section, with a knob at each end.
      float across = down / band;
      float round = sin(across * 3.14159);
      vec3 rod = vec3(0.79, 0.62, 0.29) * (0.35 + 0.75 * round)
               + vec3(1.0, 0.95, 0.8) * pow(round, 14.0) * 0.7;
      gl_FragColor = vec4(rod, opacity);
      #include <colorspace_fragment>
      return;
    }

    // From here on, the cloth: 0 at the rod, 1 at the bottom of its area.
    float cloth = (down - band) / max(1.0 - band, 0.001);
    float h = surface(vUv.x, time);
    // The hem dips a little where a fold comes forward, and sways. Kept
    // gentle: any sharper and the edge looks torn rather than hemmed.
    float hem = drop + 0.012 * h + 0.005 * sin(vUv.x * 5.0 + time * 1.4);
    if (cloth > hem) discard;

    // The light: from the slope of the surface, out of the upper left.
    float e = 0.0015;
    float slope = (surface(vUv.x + e, time) - surface(vUv.x - e, time)) / (2.0 * e);
    slope /= folds * TAU;
    vec3 normal = normalize(vec3(-slope * 1.8, 0.0, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.3, 1.0));
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float diffuse = max(dot(normal, light), 0.0);
    float facing = max(dot(normal, halfway), 0.0);
    // Silk: a soft streak down each crest and a broad glow around it.
    float shine = pow(facing, 18.0) * 0.85 + pow(facing, 4.0) * 0.25;
    // Gathered tight at the rod, so the sheen is broken up there.
    float gathered = smoothstep(0.0, 0.14, cloth);

    vec3 c = color * (0.35 + 0.65 * diffuse);
    c += sheenColor * sheen * shine * mix(0.45, 1.0, gathered);

    // The hem: a fine stitched edge catching the light.
    float edge = smoothstep(hem - 0.014, hem - 0.004, cloth) * (1.0 - smoothstep(hem - 0.004, hem, cloth));
    c += sheenColor * edge * 0.3;

    // Sheer: thinner where the cloth comes forward, thicker in the troughs,
    // and a shadow along the top where it is gathered on the rod.
    float thick = clamp(0.5 - 0.5 * h, 0.0, 1.0);
    c *= mix(0.55, 1.0, gathered);
    float a = opacity * mix(0.78, 0.96, thick);
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }
`;

/** Where the cloth hangs, in page pixels from the top left. */
interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The results box, read from the page. The canvas covers the whole window,
 * so page pixels are canvas pixels. When there is no box — a preview in the
 * builder — it hangs where the box would be.
 */
function resultsArea(width: number, height: number): Area {
  const box = document.querySelector('.results-modal')?.getBoundingClientRect();
  const found = box && box.width > 0 && box.height > 0;
  const w = found ? box.width : Math.min(width * 0.9, 500);
  const h = found ? box.height : height * 0.44;
  const left = found ? box.left : (width - w) / 2;
  const top = found ? box.top : (height - h) / 2;
  // A little wider than the box, hung a little above it, and long enough to
  // come down just past its bottom edge.
  const spare = Math.max(w * 0.04, 10);
  const above = h * 0.08;
  return { left: left - spare, top: top - above, width: w + spare * 2, height: h + above + h * 0.03 };
}

function setUniform(mesh: THREE.Mesh, name: string, value: number): void {
  (mesh.material as THREE.ShaderMaterial).uniforms[name].value = value;
}

function setPlace(mesh: THREE.Mesh, x: number, y: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.scale.set(width, height, 1);
}

interface VFXCurtainProps extends CurtainParams {
  active?: boolean;
}

const VFXCurtain: React.FC<VFXCurtainProps> = ({
  style = 'falling',
  over = 'results',
  color = '#0b0b0e',
  coverage = 1,
  fall = 0.9,
  folds = 9,
  sheen = 0.8,
  intensity = 1,
  fadeInDuration = 0.3,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);

  const mesh = useMemo(() => {
    const base = new THREE.Color(color);
    const made = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          time: { value: 0 },
          drop: { value: 0 },
          folds: { value: folds },
          opacity: { value: 0 },
          rising: { value: style === 'rising' ? 1 : 0 },
          rodBand: { value: 0.03 },
          aspect: { value: 1 },
          sheen: { value: sheen },
          color: { value: base },
          // The cloth's own colour, lightened: silver on black silk.
          sheenColor: { value: base.clone().lerp(new THREE.Color('#dfe6f2'), 0.8) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    // Behind anything else solid: things stand in front of a curtain.
    made.renderOrder = 0;
    made.frustumCulled = false;
    return made;
  }, [color, folds, sheen, style]);

  const live = useRef<THREE.Mesh | null>(null);
  useEffect(() => {
    live.current = mesh;
    return () => {
      live.current = null;
    };
  }, [mesh]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const t = clock.elapsed.current;
    const { width, height } = state.size;
    const unit = state.viewport.width / width;

    // Read every frame: the box can move, and a shaking one takes its
    // curtain with it.
    const area = over === 'screen' ? { left: 0, top: 0, width, height } : resultsArea(width, height);
    const centreX = (area.left + area.width / 2 - width / 2) * unit;
    const centreY = (height / 2 - (area.top + area.height / 2)) * unit;
    setPlace(current, centreX, centreY, area.width * unit, area.height * unit);
    // The rod is the same thickness whatever the curtain's size.
    setUniform(current, 'rodBand', Math.min(0.08, Math.max(8, height * 0.012) / area.height));
    setUniform(current, 'aspect', area.width / Math.max(area.height, 1));

    // Falls quickly and settles rather than easing to a stop: cloth has
    // weight, and a curtain that glides down reads as a wipe.
    const through = Math.min(1, t / Math.max(fall, 0.05));
    const landed = 1 - Math.pow(1 - through, 2.2);
    const settle = through >= 1 ? Math.exp(-(t - fall) * 3.4) * Math.sin((t - fall) * 11) * 0.012 : 0;
    setUniform(current, 'drop', Math.max(0, coverage * landed + settle));
    setUniform(current, 'time', t);
    setUniform(current, 'opacity', Math.min(1, clock.strength.current.value * 2.2) * intensity);
  });

  return <primitive object={mesh} />;
};

export default VFXCurtain;
