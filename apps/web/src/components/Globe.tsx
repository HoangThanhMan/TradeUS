'use client';

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export default function Globe() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // static black background requested by user
    scene.background = new THREE.Color(0x000000);
    const width = mount.clientWidth || 200;
    const height = mount.clientHeight || 200;

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    // enforce a static black clear color behind the canvas
    renderer.setClearColor(0x000000, 1);
    // set output encoding / color space with dynamic access for compatibility across three.js builds
    if ((THREE as any)['sRGBEncoding'] !== undefined) {
      (renderer as any).outputEncoding = (THREE as any)['sRGBEncoding'];
    } else if ((THREE as any)['SRGBColorSpace'] !== undefined) {
      (renderer as any).outputColorSpace = (THREE as any)['SRGBColorSpace'];
    }

    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 220);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    // globe (black & white threshold shader)
    const sphereGeom = new THREE.SphereGeometry(88, 128, 128);

    // fallback 1x1 blue texture so the globe shows oceans white before the full map loads
    const defaultData = new Uint8Array([20, 70, 200, 255]); // ocean-blue RGBA
    const defaultTexture = new THREE.DataTexture(
      defaultData,
      1,
      1,
      THREE.RGBAFormat,
    );
    defaultTexture.needsUpdate = true;

    const bwMaterial = new THREE.ShaderMaterial({
      uniforms: {
        // start with an ocean-blue fallback texture so oceans appear white immediately
        baseMap: { value: defaultTexture },
        // oceanness uses a combined metric: blue-dominance OR dark-blue + low luminance
        // amplify metric and use a sharper threshold for clearer separation
        threshold: { value: 0.08 },
        softness: { value: 0.015 },
        oceanColor: { value: new THREE.Color(0xffffff) },
        landColor: { value: new THREE.Color(0x000000) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: `uniform sampler2D baseMap; uniform float threshold; uniform float softness; uniform vec3 oceanColor; uniform vec3 landColor; varying vec2 vUv; void main(){ vec3 base = texture2D(baseMap, vUv).rgb; // blue dominance metric
        float bdom = base.b - max(base.r, base.g);
        float lum = dot(base, vec3(0.299,0.587,0.114));
        // dark-blue metric: only consider when blue exceeds red to avoid dark green/soil
        float darkBlue = (base.b > base.r) ? (0.6 - lum) : -1.0;
        float metric = max(bdom, darkBlue);
        metric = metric * 1.6; // amplify
        float t = smoothstep(threshold - softness, threshold + softness, metric);
        vec3 color = mix(landColor, oceanColor, t);
        gl_FragColor = vec4(color, 1.0); }`,
      transparent: false,
    });

    const sphere = new THREE.Mesh(sphereGeom, bwMaterial);
    scene.add(sphere);

    // subtle glow rim
    const rimGeo = new THREE.SphereGeometry(92, 64, 64);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.02,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    scene.add(rim);

    // post-processing: (bloom disabled)
    // use EffectComposer with only a RenderPass; UnrealBloomPass intentionally omitted
    let composer: EffectComposer | null = null;
    try {
      composer = new EffectComposer(renderer as any);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      // Bloom is disabled by user request; if you want to re-enable, add UnrealBloomPass here.
      // try setting tone mapping if available
      if ((THREE as any)['ACESFilmicToneMapping'] !== undefined) {
        (renderer as any).toneMapping = (THREE as any)['ACESFilmicToneMapping'];
        (renderer as any).toneMappingExposure = 1.0;
      }
    } catch (e) {
      composer = null;
    }

    // load base texture and optional normal map for more detail
    const loader = new THREE.TextureLoader();
    const baseUrl = 'https://threejs.org/examples/textures/land_ocean_2048.jpg';
    const normalUrl =
      'https://threejs.org/examples/textures/earth_normal_2048.jpg';

    loader.load(baseUrl, (tx) => {
      try {
        if ((THREE as any)['sRGBEncoding'] !== undefined)
          tx.encoding = (THREE as any)['sRGBEncoding'];
      } catch (e) {}
      try {
        const maxAniso =
          renderer.capabilities &&
          (renderer.capabilities as any).getMaxAnisotropy
            ? (renderer.capabilities as any).getMaxAnisotropy()
            : renderer.capabilities &&
                (renderer.capabilities as any).maxAnisotropy
              ? (renderer.capabilities as any).maxAnisotropy
              : 4;
        tx.anisotropy = Math.min(16, maxAniso || 4);
      } catch (e) {}
      bwMaterial.uniforms.baseMap.value = tx;
      bwMaterial.needsUpdate = true;
    });

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = false;
    controls.enableDamping = true;
    controls.rotateSpeed = 0.4;

    let frameId = 0;

    function onWindowResize() {
      if (!mount) return;
      const w = mount.clientWidth || 200;
      const h = mount.clientHeight || 200;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (typeof (composer as any)?.setSize === 'function')
        composer?.setSize(w, h);
    }

    window.addEventListener('resize', onWindowResize);

    // animate: slow rotation and subtle motion
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      sphere.rotation.y += 0.0023;
      rim.rotation.y += 0.0018;
      controls.update();
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onWindowResize);
      controls.dispose();
      // dispose composer and passes
      try {
        if (composer) {
          composer.dispose();
        }
      } catch (e) {}

      renderer.dispose();
      scene.traverse((obj) => {
        // dispose geometries and materials
        // @ts-ignore
        if (obj.geometry) obj.geometry.dispose();
        // @ts-ignore
        if (obj.material) {
          // @ts-ignore
          if (Array.isArray(obj.material)) {
            // @ts-ignore
            obj.material.forEach((m) => m.dispose());
          } else {
            // @ts-ignore
            obj.material.dispose();
          }
        }
      });
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full rounded-full" />;
}
