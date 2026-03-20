import * as THREE from 'three';
import { BOOT_SEQUENCE } from './constants';

function easing(t: number, b: number, c: number, d: number) {
  let n = t / (d / 2);
  if (n < 1) return (c / 2) * n * n + b;
  n -= 2;
  return (c / 2) * (n * n * n + 2) + b;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export type TransitionState = {
  glowOpacity: number;
  aiOpacity: number;
};

export type AnimationController = {
  setTransformation: (active: boolean) => void;
  dispose: () => void;
};

export function createOs1Animation(
  wrapper: HTMLDivElement,
  onTransitionChange: (state: TransitionState) => void,
): AnimationController {
  const length = 30;
  const radius = 5.6;
  const pi2 = Math.PI * 2;
  const frameDurationMs = 1000 / 60;
  const normalRotateValue = 0.035;
  const transformationSpeed = 1;
  const orientationFrames = Math.round(
    BOOT_SEQUENCE.transition.orientationDurationMs / frameDurationMs,
  );
  const postTurnSpinFrames = Math.round(BOOT_SEQUENCE.transition.postTurnSpinMs / frameDurationMs);
  const revealFrames = Math.round(BOOT_SEQUENCE.transition.revealDurationMs / frameDurationMs);
  const totalTransformationFrames = orientationFrames + postTurnSpinFrames + revealFrames;

  const state = {
    toend: false,
    animatestep: 0,
    stepIncrement: 1,
    isTTSProcessing: false,
    aiSphereVisible: false,
    glowOpacity: 0,
  };

  const camera = new THREE.PerspectiveCamera(65, 1, 1, 10000);
  camera.position.z = 150;

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);

  class CustomCurve extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }

    getPoint(t: number, target = new THREE.Vector3()) {
      const x = length * Math.sin(pi2 * t);
      const y = radius * Math.cos(pi2 * 3 * t);
      let tt = (t % 0.25) / 0.25;
      tt = t % 0.25 - (2 * (1 - tt) * tt * -0.0185 + tt * tt * 0.25);
      if (Math.floor(t / 0.25) === 0 || Math.floor(t / 0.25) === 2) tt *= -1;
      const z = radius * Math.sin(pi2 * 2 * (t - tt));
      return target.set(x, y, z);
    }
  }

  const path = new CustomCurve();
  const ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(path, 200, 1.1, 2, true),
    new THREE.MeshBasicMaterial({
      color: 0xf3fbff,
      transparent: true,
      opacity: 1,
    }),
  );
  group.add(ribbon);

  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(path, 200, 1.65, 2, true),
    new THREE.MeshBasicMaterial({
      color: 0x5ebfff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(glow);

  const outerGlow = new THREE.Mesh(
    new THREE.TubeGeometry(path, 200, 2.2, 2, true),
    new THREE.MeshBasicMaterial({
      color: 0x4aaeff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(outerGlow);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  const updateSize = () => {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.9;
    renderer.setSize(size, size);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  };

  updateSize();
  window.addEventListener('resize', updateSize);
  wrapper.innerHTML = '';
  wrapper.appendChild(renderer.domElement);

  let frameId = 0;
  let lastFrameTime: number | null = null;

  const render = (now = performance.now()) => {
    const deltaMs =
      lastFrameTime === null ? frameDurationMs : Math.min(frameDurationMs * 3, now - lastFrameTime);
    lastFrameTime = now;
    const deltaFrames = deltaMs / frameDurationMs;
    const rotatevalue = state.isTTSProcessing ? 0.12 : normalRotateValue;

    if (state.toend) {
      state.stepIncrement = transformationSpeed;
      state.animatestep = Math.min(
        totalTransformationFrames,
        state.animatestep + state.stepIncrement * deltaFrames,
      );
    } else {
      state.stepIncrement = 1;
      state.animatestep = Math.max(0, state.animatestep - state.stepIncrement * 1.4 * deltaFrames);
    }

    const orientationStep = Math.min(orientationFrames, state.animatestep);
    const acceleration = easing(orientationStep, 0, 1, orientationFrames);
    const revealStep = clamp01(
      (state.animatestep - orientationFrames - postTurnSpinFrames) / revealFrames,
    );
    const revealProgress = revealStep > 0 ? easing(revealStep, 0, 1, 1) : 0;
    const glowIn = clamp01(revealProgress / 0.4);
    const glowOut = clamp01((revealProgress - 0.82) / 0.18);
    const ribbonFade = clamp01((revealProgress - 0.48) / 0.36);
    const aiIn = glowOut > 0 ? 1 : clamp01((revealProgress - 0.24) / 0.56);

    group.rotation.y = 0;
    group.position.z = 0;

    if (acceleration > 0.35) {
      const progress = (acceleration - 0.35) / 0.65;
      group.rotation.y = (-Math.PI / 2) * progress;
      group.position.z = 50 * progress;
      const glowOpacity = clamp01(glowIn * (1 - glowOut));
      state.glowOpacity = glowOpacity;
    }

    (ribbon.material as THREE.MeshBasicMaterial).opacity = 1 - ribbonFade;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - ribbonFade);
    (outerGlow.material as THREE.MeshBasicMaterial).opacity = 0.22 * (1 - ribbonFade);

    const shouldShowAISphere = state.toend && aiIn > 0;
    if (state.aiSphereVisible !== shouldShowAISphere || state.glowOpacity > 0 || aiIn > 0) {
      state.aiSphereVisible = shouldShowAISphere;
      onTransitionChange({
        glowOpacity: state.toend ? state.glowOpacity : 0,
        aiOpacity: state.toend ? aiIn : 0,
      });
    }

    if (revealProgress <= 0 || !state.toend) {
      state.glowOpacity = 0;
      onTransitionChange({ glowOpacity: 0, aiOpacity: 0 });
    }

    ribbon.rotation.x += (rotatevalue + acceleration) * deltaFrames;
    glow.rotation.x = ribbon.rotation.x;
    outerGlow.rotation.x = ribbon.rotation.x;

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(render);
  };

  render();

  return {
    setTransformation(active) {
      state.toend = active;
      if (!active && state.aiSphereVisible) {
        state.aiSphereVisible = false;
        onTransitionChange({ glowOpacity: 0, aiOpacity: 0 });
      }
    },
    dispose() {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateSize);
      renderer.dispose();
      wrapper.innerHTML = '';
      onTransitionChange({ glowOpacity: 0, aiOpacity: 0 });
    },
  };
}
