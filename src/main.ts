import * as boiler from "./boiler.ts";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import * as THREE from "three/webgpu";
import { Fn, instancedArray, instanceIndex, time, sin, uniform, hash, texture } from "three/tsl";
import {GUI} from 'lil-gui'
import {DefaultLoadingManager} from 'three'

const blocker = document.createElement("div")
blocker.style.cssText = "position: fixed; background: white; width: 100vw; height: 100vh; top: 0; left: 0; z-index: 1000; display: flex; justify-content: center; align-items: center;"
document.body.appendChild(blocker)
blocker.textContent = "loading"

const loadFn = setInterval( () => {
  if (blocker.textContent !== "...")
  {
    blocker.textContent = blocker.textContent + "."
  }
  else {
    blocker.textContent = ""
  }
}, 100)

DefaultLoadingManager.onLoad = () => {
  clearInterval(loadFn)
  blocker.style.display = 'none'
}

const gui = new GUI()
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const hdrLoader = new HDRLoader();

const modelFolder = gui.addFolder("Model")
const particlesFolder = gui.addFolder("Particles")

let scene: THREE.Group;
let model: THREE.Object3D | null = null;
const settings = {
  modelScale: 4, 
  count: 400000,
  scale: 0.01,
  posX: 0,
  posY: 0,
  posZ: 0,
  visible: true,
};

// Create uniforms for dynamic values
const scaleUniform = uniform(0.01);

// Noise/Oscillation uniforms (used in compute shader)
const noiseAmplitude = uniform(0.1);
const noiseSpeed = uniform(1.0);
const noiseEnabled = uniform(1.0); // 1 = on, 0 = off

loader.load("./marble_bust_01_1k.gltf/marble_bust_01_1k.gltf", async (gltf: GLTF) => {
  scene = gltf.scene;
  model = scene.children[0];

  // Initial scale
  model.scale.setScalar(settings.modelScale)

  const nor = texLoader.load("./marble_bust_01_1k.gltf/textures/marble_bust_01_nor_gl_1k.jpg");
  const diff = texLoader.load("./marble_bust_01_1k.gltf/textures/marble_bust_01_diff_1k.jpg");
  const rough = texLoader.load("./marble_bust_01_1k.gltf/textures/marble_bust_01_rough_1k.jpg");

  nor.flipY = false;
  diff.flipY = false;
  rough.flipY = false;

  // Model
  const meshMaterial = (model as THREE.Mesh).material as THREE.MeshStandardMaterial;
  meshMaterial.map = diff;
  meshMaterial.roughnessMap = rough;
  meshMaterial.needsUpdate = true;
  meshMaterial.normalMap = nor;
  model.visible = true; 
  modelFolder.add(model, 'visible')
  boiler.scene.add(model)

  // Env
  const envMap = await hdrLoader.loadAsync("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/bryanston_park_sunrise_1k.hdr"); //prettier-ignore
  envMap.mapping = THREE.EquirectangularReflectionMapping;
  boiler.scene.environment = envMap;

  // sample positions and UVs from mesh surface
  const sampled = sample(model as THREE.Mesh, settings.count)

  //create attributes
  const position = instancedArray(sampled.positions, 'vec3')
  const originalPosition = instancedArray(sampled.positions, 'vec3') // store original for oscillation
  const particleUVs = instancedArray(sampled.uvs, 'vec2')

  // Sample textures at each particle's UV
  const particleUV = particleUVs.element(instanceIndex)

  const diffuseTexture = texture(diff)
  const normalTexture = texture(nor)

  const sampledColor = diffuseTexture.sample(particleUV)
  const sampledNormal = normalTexture.sample(particleUV)

  const material = new THREE.SpriteNodeMaterial();
  material.colorNode = sampledColor;
  material.positionNode = position.toAttribute()
  material.normalNode = sampledNormal
  material.scaleNode = scaleUniform;
  // Optional: use roughness to modulate opacity (smoother = more transparent)
  // material.opacityNode = sampledRough.r;
  // Optional: use normal map to slightly offset sprite position for depth effect
  // material.positionNode = position.toAttribute().add(sampledNormal.sub(0.5).mul(0.01)); 

  const particles = new THREE.Sprite(material)
  particles.count = settings.count;
  particles.frustumCulled = false;


  console.log(material)
  boiler.scene.add(particles)

  // Helper to resample particles (used by count and modelScale changes)
  const resampleParticles = () => {
    const newSampled = sample(model as THREE.Mesh, settings.count)
    const newPosition = instancedArray(newSampled.positions, 'vec3')
    const newUVs = instancedArray(newSampled.uvs, 'vec2')

    material.positionNode = newPosition.toAttribute()
    const newSampledColor = diffuseTexture.sample(newUVs.element(instanceIndex))
    material.colorNode = newSampledColor
    material.needsUpdate = true
    particles.count = settings.count
  }

  // Model Scale (resamples particles to match new scale)
  modelFolder.add(settings, 'modelScale').min(0.1).max(10).step(0.1).onChange((v: number) => {
    model!.scale.setScalar(v)
    resampleParticles()
  });

  // Particle Count
  particlesFolder.add(settings, 'count').min(1000).max(500000).step(1000).onChange(() => {
    resampleParticles()
  });

  // Scale
  particlesFolder.add(settings, 'scale').min(0.01).max(1).step(0.01).onChange((v: number) => {
    scaleUniform.value = v
  });

  // Position
  particles.position.x += 1.5
  const posFolder = particlesFolder.addFolder('Position');
  posFolder.add(particles.position, 'x').min(-10).max(10).step(0.1);
  posFolder.add(particles.position, 'y').min(-10).max(10).step(0.1);
  posFolder.add(particles.position, 'z').min(-10).max(10).step(0.1);

  // Visibility
  particlesFolder.add(particles, 'visible');

  // Noise/Oscillation GUI - these update uniforms used in compute shader
  const noiseFolder = particlesFolder.addFolder('Oscillation');
  noiseFolder.add(noiseAmplitude, 'value').min(0).max(1).step(0.01).name('Amplitude');
  noiseFolder.add(noiseSpeed, 'value').min(0).max(10).step(0.1).name('Speed');
  noiseFolder.add(noiseEnabled, 'value').min(0).max(1).step(1).name('Enabled (0/1)');

  // Compute - in/out oscillation with GUI-controlled uniforms
  const computeUpdate = Fn(() => {
    const origPos = originalPosition.element(instanceIndex)
    const pos = position.element(instanceIndex)

    // Per-particle phase using hash of index
    const phase = hash(instanceIndex)

    // Animated noise input: use time * speed + per-particle phase
    const animatedTime = time.mul(noiseSpeed).add(phase.mul(10.28))

    //
    const amp = noiseAmplitude.mul(sin(time))
    console.log(amp)
    const oscillation = sin(animatedTime).mul(amp)

    // Calculate new position: original + (direction * oscillation * enabled)
    // Using assign to completely overwrite (no accumulation)
    pos.assign(origPos).mul(oscillation.mul(phase))
    pos.addAssign((oscillation))
  })

  // reference the compute particles
	const computeParticles = computeUpdate().compute(settings.count).setName('Update Particles');
  // const computeHit = Fn(() => {})().compute(count).setName("Hit")

  // animation - temporarily disabled to debug
  boiler.addAnimation(() => {
     boiler.renderer.compute(computeParticles)
  })
});


// sampler - returns { positions, uvs, normals }
const sample = (model: THREE.Mesh, count: number) => {
  const sampler = new MeshSurfaceSampler(model).build();

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const normals = new Float32Array(count * 3);

  const _position = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _uv = new THREE.Vector2();

  // Get the model's world matrix to transform local -> world space
  model.updateMatrixWorld();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(model.matrixWorld);

  for (let i = 0; i < count; i++) {
    sampler.sample(_position, _normal, undefined, _uv);

    // Apply world transform (includes scale, rotation, position)
    _position.applyMatrix4(model.matrixWorld);
    _normal.applyMatrix3(normalMatrix).normalize();

    positions[i * 3] = _position.x;
    positions[i * 3 + 1] = _position.y;
    positions[i * 3 + 2] = _position.z;

    normals[i * 3] = _normal.x;
    normals[i * 3 + 1] = _normal.y;
    normals[i * 3 + 2] = _normal.z;

    uvs[i * 2] = _uv.x;
    uvs[i * 2 + 1] = _uv.y;
  }

  return { positions, uvs, normals } 
}
