"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const CRYSTAL_COLORS = ["#ff4f1f", "#f97332", "#ffc857", "#ff9eb5", "#fff1da"];

export default function CrystalCBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileViewport = window.matchMedia("(max-width: 760px)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 10);

    let renderer: THREE.WebGLRenderer | null = null;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const renderScene = () => {
      if (renderer) {
        renderer.render(scene, camera);
      }
    };

    const stopAnimation = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobileViewport.matches });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.prepend(renderer.domElement);

      const sculpture = new THREE.Group();
      scene.add(sculpture);
      scene.add(new THREE.HemisphereLight(0xfff3de, 0x9b4327, 2.1));

      const warmLight = new THREE.PointLight(0xff713b, 44, 16);
      warmLight.position.set(2.4, 1.6, 3.6);
      scene.add(warmLight);

      const goldLight = new THREE.PointLight(0xffd27a, 34, 14);
      goldLight.position.set(-3.5, -1.8, 3.5);
      scene.add(goldLight);

      const innerLight = new THREE.PointLight(0xff4f1f, 18, 7);
      innerLight.position.set(0.8, 0.1, 2.1);
      scene.add(innerLight);

      const isMobile = mobileViewport.matches;
      sculpture.scale.setScalar(isMobile ? 1.05 : 1.32);
      const crystalCount = isMobile ? 96 : 240;
      const shardGeometries = [
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.OctahedronGeometry(1, 0),
        new THREE.DodecahedronGeometry(1, 0),
      ];
      geometries.push(...shardGeometries);
      const shardMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.19,
        metalness: 0.09,
        transmission: 0.1,
        thickness: 0.38,
        ior: 1.28,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        emissive: 0x7a2109,
        emissiveIntensity: 0.32,
        transparent: true,
        opacity: 0.93,
        flatShading: true,
      });
      materials.push(shardMaterial);

      const shardCounts = shardGeometries.map((_, type) =>
        Math.ceil((crystalCount - type) / shardGeometries.length)
      );
      const shardMeshes = shardGeometries.map((geometry, type) => {
        const mesh = new THREE.InstancedMesh(geometry, shardMaterial, shardCounts[type]);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        return mesh;
      });
      const shardSlots = shardGeometries.map(() => 0);
      const transform = new THREE.Object3D();
      const color = new THREE.Color();
      const ringRadiusX = 1.82;
      const ringRadiusY = 2.02;
      const arcStart = 0.63;
      const arcLength = Math.PI * 2 - arcStart * 2;

      for (let index = 0; index < crystalCount; index += 1) {
        const progress = index / Math.max(1, crystalCount - 1);
        const angle = arcStart + progress * arcLength;
        const edge = Math.sin(progress * Math.PI);
        const scatter = ((index * 37) % 19) / 19 - 0.5;
        const radiusShift = scatter * (0.12 + edge * 0.14);
        const size = 0.19 + ((index * 13) % 15) / 62;
        const type = index % shardGeometries.length;
        const mesh = shardMeshes[type];
        const slot = shardSlots[type];

        transform.position.set(
          Math.cos(angle) * (ringRadiusX + radiusShift),
          Math.sin(angle) * (ringRadiusY + radiusShift),
          scatter * 0.72 + Math.sin(index * 1.7) * 0.18
        );
        transform.rotation.set(
          index * 0.37,
          index * 0.61,
          angle + Math.PI / 2 + scatter * 0.75
        );
        transform.scale.set(size * (0.74 + edge * 0.3), size * (0.68 + Math.abs(scatter)), size * (0.72 + edge * 0.25));
        transform.updateMatrix();
        mesh.setMatrixAt(slot, transform.matrix);
        color.set(CRYSTAL_COLORS[(index * 7 + Math.floor(progress * 4)) % CRYSTAL_COLORS.length]);
        mesh.setColorAt(slot, color);
        shardSlots[type] += 1;
      }

      shardMeshes.forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
        sculpture.add(mesh);
      });

      const floatingCount = isMobile ? 8 : 20;
      const floatingShards = new THREE.InstancedMesh(shardGeometries[1], shardMaterial, floatingCount);
      floatingShards.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      for (let index = 0; index < floatingCount; index += 1) {
        const angle = index * 2.399 + 0.3;
        const radius = 2.8 + ((index * 17) % 13) / 15;
        const size = 0.12 + ((index * 11) % 10) / 48;
        transform.position.set(
          Math.cos(angle) * radius * 1.08,
          Math.sin(angle) * radius,
          (index % 2 === 0 ? 1 : -1) * (0.8 + ((index * 7) % 8) / 10)
        );
        transform.rotation.set(angle * 0.7, angle * 0.45, angle);
        transform.scale.set(size, size * (0.8 + ((index * 5) % 5) / 10), size * 0.85);
        transform.updateMatrix();
        floatingShards.setMatrixAt(index, transform.matrix);
        color.set(CRYSTAL_COLORS[(index * 5 + 1) % CRYSTAL_COLORS.length]);
        floatingShards.setColorAt(index, color);
      }
      floatingShards.instanceMatrix.needsUpdate = true;
      if (floatingShards.instanceColor) {
        floatingShards.instanceColor.needsUpdate = true;
      }
      sculpture.add(floatingShards);

      const orbitGroup = new THREE.Group();
      sculpture.add(orbitGroup);
      const orbitConfigs = [
        { x: 2.95, y: 1.12, z: -0.82, color: "#fff4df", opacity: 0.72 },
        { x: 2.72, y: 1.42, z: 0.83, color: "#ff9a66", opacity: 0.5 },
        { x: 2.35, y: 2.48, z: -0.22, color: "#ffc857", opacity: 0.38 },
      ];

      for (const orbit of orbitConfigs) {
        const points = new THREE.EllipseCurve(0, 0, orbit.x, orbit.y, 0, Math.PI * 2, false, 0)
          .getPoints(128)
          .slice(0, -1)
          .map((point) => new THREE.Vector3(point.x, point.y, 0));
        const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
        const haloGeometry = new THREE.TubeGeometry(curve, 128, isMobile ? 0.04 : 0.055, 5, true);
        const haloMaterial = new THREE.MeshBasicMaterial({
          color: orbit.color,
          transparent: true,
          opacity: orbit.opacity * 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const coreGeometry = new THREE.TubeGeometry(curve, 128, 0.009, 4, true);
        const coreMaterial = new THREE.MeshBasicMaterial({
          color: orbit.color,
          transparent: true,
          opacity: orbit.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        halo.rotation.set(orbit.z, orbit.z * 0.35, orbit.z * 0.22);
        core.rotation.copy(halo.rotation);
        orbitGroup.add(halo, core);
        geometries.push(haloGeometry, coreGeometry);
        materials.push(haloMaterial, coreMaterial);
      }

      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 96;
      glowCanvas.height = 96;
      const glowContext = glowCanvas.getContext("2d");
      const radialGlow = glowContext?.createRadialGradient(48, 48, 2, 48, 48, 48);
      radialGlow?.addColorStop(0, "rgba(255, 238, 204, 0.72)");
      radialGlow?.addColorStop(0.22, "rgba(255, 134, 64, 0.32)");
      radialGlow?.addColorStop(1, "rgba(255, 100, 40, 0)");
      if (glowContext && radialGlow) {
        glowContext.fillStyle = radialGlow;
        glowContext.fillRect(0, 0, 96, 96);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        glowTexture.colorSpace = THREE.SRGBColorSpace;
        textures.push(glowTexture);
        const glowPalette = [0xff8a4b, 0xffc857, 0xff9eb5, 0xfff1da, 0xff5a2c, 0xffc857, 0xff9eb5];
        const glowCount = isMobile ? 3 : 7;
        for (let index = 0; index < glowCount; index += 1) {
          const angle = index * 2.399 + 0.4;
          const radius = 2.35 + ((index * 9) % 12) / 10;
          const glowMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            color: glowPalette[index % glowPalette.length],
            transparent: true,
            opacity: isMobile ? 0.22 : 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const sprite = new THREE.Sprite(glowMaterial);
          sprite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.8, -1.25 - index * 0.035);
          const size = 0.75 + ((index * 7) % 8) / 10;
          sprite.scale.set(size, size, 1);
          sculpture.add(sprite);
          materials.push(glowMaterial);
        }
      }

      const particleCount = isMobile ? 22 : 52;
      const particlePositions = new Float32Array(particleCount * 3);
      const particleColors = new Float32Array(particleCount * 3);
      const particlePalette = CRYSTAL_COLORS.map((entry) => new THREE.Color(entry));
      for (let index = 0; index < particleCount; index += 1) {
        const angle = index * 2.399;
        const radius = 2.7 + ((index * 17) % 31) / 18;
        particlePositions[index * 3] = Math.cos(angle) * radius;
        particlePositions[index * 3 + 1] = Math.sin(angle) * radius * 0.78;
        particlePositions[index * 3 + 2] = ((index * 13) % 21) / 7 - 1.5;
        const particleColor = particlePalette[index % particlePalette.length];
        particleColors[index * 3] = particleColor.r;
        particleColors[index * 3 + 1] = particleColor.g;
        particleColors[index * 3 + 2] = particleColor.b;
      }

      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
      particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
      const particleMaterial = new THREE.PointsMaterial({
        size: isMobile ? 0.035 : 0.045,
        transparent: true,
        opacity: 0.8,
        vertexColors: true,
        sizeAttenuation: true,
      });
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      sculpture.add(particles);
      geometries.push(particleGeometry);
      materials.push(particleMaterial);

      const resize = () => {
        if (!renderer) {
          return;
        }
        const bounds = host.getBoundingClientRect();
        const width = Math.max(1, bounds.width);
        const height = Math.max(1, bounds.height);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderScene();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      const animate = (time: number) => {
        if (!renderer || document.hidden || reducedMotion.matches) {
          animationFrame = 0;
          return;
        }
        const seconds = time * 0.001;
        sculpture.rotation.y = Math.sin(seconds * 0.2) * 0.1 + pointerX * 0.045;
        sculpture.rotation.x = Math.sin(seconds * 0.16) * 0.035 + pointerY * 0.035;
        sculpture.rotation.z = Math.sin(seconds * 0.12) * 0.018;
        orbitGroup.rotation.z = seconds * 0.018;
        particles.rotation.z = -seconds * 0.008;
        renderScene();
        animationFrame = window.requestAnimationFrame(animate);
      };

      const startAnimation = () => {
        stopAnimation();
        renderScene();
        if (!document.hidden && !reducedMotion.matches) {
          animationFrame = window.requestAnimationFrame(animate);
        }
      };

      const handleVisibility = () => {
        if (document.hidden) {
          stopAnimation();
        } else {
          startAnimation();
        }
      };
      const handleMotionChange = () => startAnimation();
      const handlePointerMove = (event: PointerEvent) => {
        const bounds = host.getBoundingClientRect();
        pointerX = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
        pointerY = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
      };
      const handlePointerLeave = () => {
        pointerX = 0;
        pointerY = 0;
      };

      document.addEventListener("visibilitychange", handleVisibility);
      reducedMotion.addEventListener("change", handleMotionChange);
      mobileViewport.addEventListener("change", resize);
      host.addEventListener("pointermove", handlePointerMove);
      host.addEventListener("pointerleave", handlePointerLeave);
      host.dataset.ready = "true";
      startAnimation();

      return () => {
        stopAnimation();
        resizeObserver?.disconnect();
        document.removeEventListener("visibilitychange", handleVisibility);
        reducedMotion.removeEventListener("change", handleMotionChange);
        mobileViewport.removeEventListener("change", resize);
        host.removeEventListener("pointermove", handlePointerMove);
        host.removeEventListener("pointerleave", handlePointerLeave);
        delete host.dataset.ready;
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        textures.forEach((texture) => texture.dispose());
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          renderer = null;
        }
      };
    } catch {
      stopAnimation();
      resizeObserver?.disconnect();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = null;
      return () => {};
    }
  }, []);

  return (
    <div className="cc-crystal-stage" ref={hostRef} aria-hidden="true">
      <span className="cc-crystal-fallback">C</span>
      <span className="cc-crystal-glow" />
    </div>
  );
}
