import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MEME_GIFS, giphyVideoUrl } from '../giphy';
import type { MemesParams } from '../types';
import { popOut, useFadeClock } from './fadeClock';
import { scatter, seededRandom, shuffle, turnedBox } from './scatter';

/**
 * A few meme GIFs, a different few each time, popping up at random spots
 * around the frame and playing until the effect fades.
 *
 * They come from Giphy as small silent videos and play as textures — see
 * vfx/giphy.ts for why not the GIFs themselves. Nothing is downloaded until
 * the effect starts, so each one pops in as soon as it has loaded; one that
 * fails to load simply never appears. Solid pictures, so drawn after the bloom.
 */

/** Seconds one takes to pop in. */
const POP = 0.35;

const DEFAULT_GIFS = [...MEME_GIFS];

/**
 * Videos only play on some phones while they are part of the page, so they
 * are kept in a box too small to see rather than left detached.
 */
function videoHost(): HTMLElement {
  const existing = document.getElementById('vfx-video-host');
  if (existing) return existing;
  const host = document.createElement('div');
  host.id = 'vfx-video-host';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(host);
  return host;
}

interface Player {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  /** Height over width. */
  aspect: number;
  /** Effect time at which it had loaded. */
  readyAt: number;
}

interface VFXMemesProps extends MemesParams {
  active?: boolean;
  /** Picks which memes play, and where. See VFXSparkles. */
  seed?: number;
}

const VFXMemes: React.FC<VFXMemesProps> = ({
  gifs = DEFAULT_GIFS,
  count = 4,
  size = 0.3,
  tilt = 10,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);
  const gifList = gifs.join('\n');

  // Which play this time, each with its tilt and the moment it is due.
  const picks = useMemo(() => {
    const random = seededRandom(seed * 7907 + 29);
    const pool = shuffle([...new Set(gifList.split('\n').filter(Boolean))], random);
    const chosen = pool.slice(0, Math.max(1, Math.round(count)));
    const due = Math.max(fadeInDuration, 0.2) + duration * 0.3;
    return chosen.map((id, k) => ({
      id,
      angle: (random() * 2 - 1) * ((tilt * Math.PI) / 180),
      due: ((k + random() * 0.8) / chosen.length) * due,
    }));
  }, [gifList, count, tilt, seed, fadeInDuration, duration]);

  // Each gets a square to itself; the picture is fitted inside it once its
  // shape is known, so a tall one cannot reach into the middle.
  const layout = useMemo(() => {
    const random = seededRandom(seed * 104711 + 11);
    const side = size * Math.min(frame.width, frame.height);
    const spots = scatter(
      picks.map((pick) => turnedBox({ width: side, height: side }, pick.angle)),
      frame,
      random,
    );
    return picks.map((pick, i) => ({ ...pick, side, spot: spots[i] }));
  }, [picks, frame, size, seed]);

  // Filled in as each video loads. Kept in a ref: loading is not a reason to
  // re-render, the next frame simply picks it up.
  const players = useRef<(Player | null)[]>([]);
  const elapsed = clock.elapsed;

  useEffect(() => {
    const host = videoHost();
    const started: { video: HTMLVideoElement; texture: THREE.VideoTexture | null }[] = [];
    players.current = picks.map(() => null);
    picks.forEach((pick, i) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      // iOS reads the attributes, not only the properties.
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.width = 1;
      video.height = 1;
      const entry: (typeof started)[number] = { video, texture: null };
      video.addEventListener(
        'loadeddata',
        () => {
          if (!video.videoWidth) return;
          const texture = new THREE.VideoTexture(video);
          texture.colorSpace = THREE.SRGBColorSpace;
          entry.texture = texture;
          players.current[i] = { video, texture, aspect: video.videoHeight / video.videoWidth, readyAt: elapsed.current };
          if (video.paused) video.play().catch(() => {});
        },
        { once: true },
      );
      video.src = giphyVideoUrl(pick.id);
      host.appendChild(video);
      video.play().catch(() => {});
      started.push(entry);
    });
    return () => {
      for (const { video, texture } of started) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        texture?.dispose();
      }
      players.current = [];
    };
  }, [picks, elapsed]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const group = useMemo(() => {
    const g = new THREE.Group();
    for (let i = 0; i < layout.length; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        // The canvas turns on tone mapping, which would dull the pictures.
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    return g;
  }, [layout, geometry]);
  useEffect(
    () => () => group.children.forEach((child) => ((child as THREE.Mesh).material as THREE.Material).dispose()),
    [group],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const unit = state.viewport.width / state.size.width;
    layout.forEach((item, i) => {
      const mesh = group.children[i] as THREE.Mesh;
      const player = players.current[i];
      const since = player ? (t - Math.max(item.due, player.readyAt)) / POP : 0;
      if (!player || !item.spot || since <= 0) {
        mesh.visible = false;
        return;
      }
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (material.map !== player.texture) {
        material.map = player.texture;
        material.needsUpdate = true;
      }
      // three.js refreshes a video texture only when the browser announces a
      // new frame, and a page that is not on screen announces none: the video
      // played and nothing was drawn. Refreshing every frame costs a 200-pixel
      // upload and does not depend on it.
      if (player.video.readyState >= 2) player.texture.needsUpdate = true;
      // Fitted inside its square, the longer side filling it.
      const side = item.side * item.spot.scale;
      const aspect = Math.min(Math.max(player.aspect, 0.25), 4);
      const width = aspect <= 1 ? side : side / aspect;
      const height = aspect <= 1 ? side * aspect : side;
      const pop = popOut(since);
      mesh.visible = true;
      mesh.position.set(
        (item.spot.x - state.size.width / 2) * unit,
        (item.spot.y - state.size.height / 2) * unit,
        0,
      );
      mesh.scale.set(width * unit * pop, height * unit * pop, 1);
      mesh.rotation.z = item.angle;
      material.opacity = fade * Math.min(1, since * 3);
    });
  });

  return <primitive object={group} />;
};

export default VFXMemes;
