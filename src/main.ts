import * as boiler from "./boiler.ts";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import * as THREE from "three/webgpu";
import { attribute, float, Fn, instancedArray, instanceIndex, attributeArray, time, oscSine, mul, sin, vec3, vec4, uniform, hash, texture } from "three/tsl";
import {GUI} from 'lil-gui'

const gui = new GUI()
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const hdrLoader = new HDRLoader();

const modelFolder = gui.addFolder("Model")
const particlesFolder = gui.addFolder("Particles")

let scene, model;
const settings = {
  count: 50000,
  scale: 0.01,
  posX: 0,
  posY: 0,
  posZ: 0,
  visible: true,
};

// Create uniforms for dynamic values
const scaleUniform = uniform(0.01);
const colorUniform = uniform(new THREE.Color(1.0, 0.0, 0.0));

// Oscillation uniforms
const oscAmplitude = uniform(0.0005);
const oscSpeed = uniform(1.0);
const oscFrequency = uniform(6.28);

loader.load("./marble_bust_01_1k.gltf/marble_bust_01_1k.gltf", async (gltf) => {
  scene = gltf.scene;
  model = scene.children[0];

  const nor = texLoader.load("./marble_bust_01_1k.gltf/textures/nor.jpg");
  const diff = texLoader.load("./marble_bust_01_1k.gltf/textures/diff.jpg");
  const rough = texLoader.load("./marble_bust_01_1k.gltf/textures/rough.jpg");

  nor.flipY = false;
  diff.flipY = false;
  rough.flipY = false;

  // Model
  model.material.map = diff;
  model.material.roughnessMap = rough;
  model.material.needsUpdate = true;
  model.material.normalMap = nor;
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
  const particleUVs = instancedArray(sampled.uvs, 'vec2')
  const velocities = instancedArray(settings.count, 'vec3')
  const colors = instancedArray(settings.count, 'vec3')

  // Sample the diffuse texture at each particle's UV
  const diffuseTexture = texture(diff)
  const particleUV = particleUVs.element(instanceIndex)
  const sampledColor = diffuseTexture.sample(particleUV)

  const material = new THREE.SpriteNodeMaterial();
  material.colorNode = sampledColor; // use sampled texture color
  material.positionNode = position.toAttribute()
  material.scaleNode = scaleUniform; 

  const particles = new THREE.Sprite(material)
  particles.count = settings.count;
  particles.frustumCulled = false;
  boiler.scene.add(particles)

  // Particle Count
  particlesFolder.add(settings, 'count').min(1000).max(100000).step(1000).onChange((v: number) => {
    const newSampled = sample(model as THREE.Mesh, v)
    const newPosition = instancedArray(newSampled.positions, 'vec3')
    const newUVs = instancedArray(newSampled.uvs, 'vec2')

    material.positionNode = newPosition.toAttribute()
    // Note: updating colorNode with new UVs requires rebuilding the texture sample
    const newSampledColor = diffuseTexture.sample(newUVs.element(instanceIndex))
    material.colorNode = newSampledColor
    material.needsUpdate = true
    particles.count = v
  });

  // Scale
  particlesFolder.add(settings, 'scale').min(0.01).max(1).step(0.01).onChange((v: number) => {
    scaleUniform.value = v
  });

  // Position
  particles.position.x += .5
  const posFolder = particlesFolder.addFolder('Position');
  posFolder.add(particles.position, 'x').min(-10).max(10).step(0.1);
  posFolder.add(particles.position, 'y').min(-10).max(10).step(0.1);
  posFolder.add(particles.position, 'z').min(-10).max(10).step(0.1);

  // Visibility
  particlesFolder.add(particles, 'visible');

  // Oscillation GUI
  const oscFolder = particlesFolder.addFolder('Oscillation');
  oscFolder.add(oscAmplitude, 'value').min(0).max(0.01).step(0.0001).name('Amplitude');
  oscFolder.add(oscSpeed, 'value').min(0).max(5).step(0.1).name('Speed');
  oscFolder.add(oscFrequency, 'value').min(1).max(20).step(0.1).name('Frequency');

  // Compute - in/out oscillation
  const computeUpdate = Fn(() => {
    const pos = position.element(instanceIndex)

    // Per-particle random phase offset (0-1)
    const phase = hash(instanceIndex)

    // Oscillation: sin(time*speed + phase * frequency) * amplitude
    const oscil = sin(time.mul(oscSpeed).add(phase.mul(oscFrequency))).mul(oscAmplitude)

    // Direction from center (normalized position = outward direction)
    const dir = pos.normalize()

    // Push in/out along the direction
    pos.addAssign(dir.mul(oscil))
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

  for (let i = 0; i < count; i++) {
    sampler.sample(_position, _normal, undefined, _uv);

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
