import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Remove default margins/padding from body
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";

const canvas = document.createElement("canvas");
canvas.style.cssText =
  "display: block; position: fixed; width: 100vw; height: 100vh; z-index: 10";
document.body.appendChild(canvas);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.max(window.devicePixelRatio, 1.5));

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 4;

// Handle window resize
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", onWindowResize);

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
