import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WeaponsParams } from '../types';
import { useFadeClock } from './fadeClock';
import { seededRandom } from './scatter';
import { SHOT_ASPECT, WEAPON_ASPECT, flashTexture, shotTexture, weaponTexture } from './weapons/textures';
import type { WeaponKind } from './weapons/textures';

/**
 * Weapons poking in from the sides and firing across the screen: pistols,
 * rifles, a cannon, lasers, bows or rockets.
 *
 * Each weapon keeps its own time, so a row of them never fires in unison,
 * and each shot is a drawing flying across rather than a particle: a bullet
 * has a head and a tail, an arrow has fletching, a rocket trails flame.
 *
 * One kind per effect, as the clocks are, so a battery of mixed weapons is
 * this effect several times over.
 */

/** Seconds a shot takes to cross, and how long the flash lasts. */
const FLIGHT: Record<WeaponKind, number> = {
  pistol: 0.85,
  rifle: 0.7,
  cannon: 1.5,
  laser: 0.4,
  bow: 1.1,
  missile: 1.3,
};
const FLASH_TIME = 0.09;
/** How many shots from one weapon can be in the air at once. */
const IN_FLIGHT = 3;

function setPose(mesh: THREE.Mesh, x: number, y: number, turn: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.rotation.z = turn;
  mesh.scale.set(width, height, 1);
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, value);
}

function solid(map: THREE.Texture, color: string, order: number, additive = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      // The canvas turns tone mapping on, which would dull the drawing.
      toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

interface VFXWeaponsProps extends WeaponsParams {
  active?: boolean;
  /** Varies where they stand and when they fire. See VFXSparkles. */
  seed?: number;
}

const VFXWeapons: React.FC<VFXWeaponsProps> = ({
  style = 'pistol',
  side = 'both',
  count = 3,
  rate = 1.2,
  size = 0.18,
  color = '#ffffff',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);

  // Where each weapon stands, when it starts firing, and how big it is.
  const guns = useMemo(() => {
    const random = seededRandom(seed * 6151 + 71);
    const many = Math.max(1, Math.round(count));
    const sides = side === 'both' ? [-1, 1] : [side === 'left' ? -1 : 1];
    return sides.flatMap((facing) =>
      Array.from({ length: many }, (_, i) => ({
        facing,
        // Spread down the edge, then nudged, so two sides do not mirror.
        place: 0.1 + ((i + 0.5) / many) * 0.8 + (random() - 0.5) * 0.1,
        phase: random() * 0.9,
        scale: 0.85 + random() * 0.3,
        drift: (random() - 0.5) * 0.18,
      })),
    );
  }, [count, side, seed]);

  const parts = useMemo(() => {
    const kind = style as WeaponKind;
    const weaponMap = weaponTexture(kind);
    const shotMap = shotTexture(kind);
    const flashMap = flashTexture();
    const group = new THREE.Group();
    const weapons = guns.map(() => {
      const mesh = solid(weaponMap, color, 2);
      group.add(mesh);
      return mesh;
    });
    const flashes = guns.map(() => {
      const mesh = solid(flashMap, '#ffffff', 4, true);
      group.add(mesh);
      return mesh;
    });
    const shots = guns.flatMap(() =>
      Array.from({ length: IN_FLIGHT }, () => {
        const mesh = solid(shotMap, color, 3, kind === 'laser');
        group.add(mesh);
        return mesh;
      }),
    );
    return { group, weapons, flashes, shots, kind };
  }, [style, color, guns]);

  const live = useRef<typeof parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      for (const mesh of [...parts.weapons, ...parts.flashes, ...parts.shots]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
    [parts],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const unit = state.viewport.width / state.size.width;
    const height = size * Math.min(frame.width, frame.height) * unit;
    const halfWidth = state.viewport.width / 2;
    const flight = FLIGHT[current.kind] ?? 0.9;
    const shotHeight = height * 0.42;

    guns.forEach((gun, i) => {
      const tall = height * gun.scale;
      const wide = tall * WEAPON_ASPECT[current.kind];
      const y = (gun.place - 0.5) * state.viewport.height;
      // Far enough in that the muzzle clears the edge, and no further.
      const muzzleX = gun.facing < 0 ? -halfWidth + wide * 0.62 : halfWidth - wide * 0.62;
      const bodyX = gun.facing < 0 ? -halfWidth + wide * 0.12 : halfWidth - wide * 0.12;
      // Mirrored by a negative width, so one drawing serves both sides.
      setPose(current.weapons[i], bodyX, y, 0, wide * gun.facing, tall);
      setOpacity(current.weapons[i], fade);

      const since = t - gun.phase;
      const shotsFired = Math.floor(since * Math.max(rate, 0.05));
      const lastFire = gun.phase + shotsFired / Math.max(rate, 0.05);
      const flash = current.flashes[i];
      const sinceFlash = t - lastFire;
      if (shotsFired >= 0 && sinceFlash >= 0 && sinceFlash < FLASH_TIME) {
        const grow = 1 - sinceFlash / FLASH_TIME;
        setPose(flash, muzzleX, y, 0, tall * 0.9 * grow * gun.facing, tall * 0.9 * grow);
        setOpacity(flash, fade * grow);
      } else {
        setOpacity(flash, 0);
      }

      for (let j = 0; j < IN_FLIGHT; j++) {
        const mesh = current.shots[i * IN_FLIGHT + j];
        const number = shotsFired - j;
        const fired = gun.phase + number / Math.max(rate, 0.05);
        const progress = (t - fired) / flight;
        if (number < 0 || progress < 0 || progress > 1) {
          setOpacity(mesh, 0);
          continue;
        }
        const travel = progress * (state.viewport.width + wide);
        const x = muzzleX + travel * -gun.facing;
        const lift = gun.drift * travel * 0.25;
        const wideShot = shotHeight * SHOT_ASPECT[current.kind];
        setPose(
          mesh,
          x,
          y + lift,
          Math.atan2(gun.drift * 0.25, 1) * -gun.facing,
          wideShot * gun.facing,
          shotHeight,
        );
        // Full strength most of the way, gone before it reaches the far edge.
        setOpacity(mesh, fade * Math.min(1, progress * 8) * (1 - Math.max(0, progress - 0.82) / 0.18));
      }
    });
  });

  return <primitive object={parts.group} />;
};

export default VFXWeapons;
