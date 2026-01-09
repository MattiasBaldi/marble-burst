import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const canvas = document.createElement("canvas");
canvas.style.cssText =
  "display: block; position: fixed; width: 100vw; height: 100vh; z-index: 10";
document.body.appendChild(canvas);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 1;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const scene = new THREE.Scene();

const animationCallbacks: Array<() => void> = [];
function addAnimation(callback: () => void) {
  animationCallbacks.push(callback);
}

async function init() {
  await renderer.init();

  renderer.setAnimationLoop(() => {
    controls.update();
    animationCallbacks.forEach((cb) => cb());
    renderer.render(scene, camera);
  });
}

init();

export { canvas, camera, renderer, scene, controls, addAnimation };
