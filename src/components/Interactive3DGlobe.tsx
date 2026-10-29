import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Globe, MapPin, Compass, RotateCw, Sparkles, Navigation } from 'lucide-react';

interface Interactive3DGlobeProps {
  lat: number;
  lon: number;
  cityName: string;
  country?: string;
  temperature?: number;
  condition?: string;
  unit?: 'C' | 'F';
  onSelectCoordinates?: (lat: number, lon: number, name: string) => void;
}

export const Interactive3DGlobe: React.FC<Interactive3DGlobeProps> = ({
  lat,
  lon,
  cityName,
  country,
  temperature,
  condition,
  unit = 'C',
  onSelectCoordinates
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const globeSceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    globeGroup: THREE.Group;
    markerGroup: THREE.Group;
    animFrameId: number;
  } | null>(null);

  // Global major weather hubs for interactive pin markers
  const GLOBAL_HUBS = [
    { name: 'Current Location', lat, lon, active: true },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503, active: false },
    { name: 'London', lat: 51.5074, lon: -0.1278, active: false },
    { name: 'New York', lat: 40.7128, lon: -74.0060, active: false },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093, active: false },
    { name: 'Paris', lat: 48.8566, lon: 2.3522, active: false },
    { name: 'Dubai', lat: 25.2048, lon: 55.2708, active: false },
  ];

  // Convert lat/lon coordinates to 3D sphere point
  const latLonToVector3 = (latitude: number, longitude: number, radius: number) => {
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 320;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 6.2;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.replaceChildren(renderer.domElement);

    // 3. Globe Container Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // 4. Core Sphere (Dark Obsidian Metallic Earth)
    const sphereGeo = new THREE.SphereGeometry(2, 64, 64);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#0A1329'),
      emissive: new THREE.Color('#030A19'),
      specular: new THREE.Color('#38BDF8'),
      shininess: 35,
      wireframe: false,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphereMesh);

    // 5. Wireframe Grid Overlay (Longitude / Latitude lines)
    const gridGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(2.01, 24, 24));
    const gridMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#0EA5E9'),
      transparent: true,
      opacity: 0.15,
    });
    const gridLines = new THREE.LineSegments(gridGeo, gridMat);
    globeGroup.add(gridLines);

    // 6. Outer Atmosphere Cloud Glow Shell
    const cloudsGeo = new THREE.SphereGeometry(2.08, 48, 48);
    const cloudsMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38BDF8'),
      transparent: true,
      opacity: 0.12,
      wireframe: true,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    globeGroup.add(cloudsMesh);

    // 7. Orbital Particle Ring (Atmospheric Ring)
    const ringGeo = new THREE.RingGeometry(2.3, 2.38, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#06B6D4'),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    globeGroup.add(ringMesh);

    // 8. Marker Pins Group
    const markerGroup = new THREE.Group();
    globeGroup.add(markerGroup);

    // Create Pin Markers for Current City and Global Stations
    const activeHubs = [
      { name: cityName || 'Current Location', lat, lon, active: true },
      ...GLOBAL_HUBS.filter(h => Math.abs(h.lat - lat) > 1 || Math.abs(h.lon - lon) > 1)
    ];

    activeHubs.forEach((hub) => {
      const pos = latLonToVector3(hub.lat, hub.lon, 2.02);
      
      // Marker Dot
      const dotGeo = new THREE.SphereGeometry(hub.active ? 0.08 : 0.04, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({
        color: hub.active ? new THREE.Color('#10B981') : new THREE.Color('#38BDF8'),
      });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.copy(pos);
      markerGroup.add(dotMesh);

      // Pulse Ring for Active Pin
      if (hub.active) {
        const pulseGeo = new THREE.RingGeometry(0.09, 0.14, 16);
        const pulseMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#10B981'),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        pulseMesh.position.copy(pos);
        pulseMesh.lookAt(new THREE.Vector3(0, 0, 0));
        markerGroup.add(pulseMesh);
      }
    });

    // Initial Rotation to target Current City
    const targetVector = latLonToVector3(lat, lon, 2.02);
    globeGroup.rotation.y = -Math.atan2(targetVector.x, targetVector.z);
    globeGroup.rotation.x = Math.asin(targetVector.y / 2.02) * 0.5;

    // 9. Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight1.position.set(5, 3, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 1.2);
    dirLight2.position.set(-5, -2, -5);
    scene.add(dirLight2);

    // 10. Mouse Drag Interaction Controls
    let isMouseDown = false;
    let previousMousePosition = { x: 0, y: 0 };

    const handleMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      globeGroup.rotation.y += deltaX * 0.008;
      globeGroup.rotation.x += deltaY * 0.008;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Touch event handling for mobile devices
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isMouseDown = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isMouseDown || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePosition.x;
      const deltaY = e.touches[0].clientY - previousMousePosition.y;

      globeGroup.rotation.y += deltaX * 0.008;
      globeGroup.rotation.x += deltaY * 0.008;

      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleMouseUp);

    // 11. Animation Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (isRotating && !isMouseDown) {
        globeGroup.rotation.y += 0.0025;
        cloudsMesh.rotation.y += 0.0012;
      }

      ringMesh.rotation.z += 0.003;
      renderer.render(scene, camera);
    };
    animate();

    globeSceneRef.current = { scene, camera, renderer, globeGroup, markerGroup, animFrameId: animId };

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || 320;
      const newHeight = container.clientHeight || 320;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElement.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
      renderer.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      cloudsGeo.dispose();
      cloudsMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, [lat, lon, cityName, isRotating]);

  return (
    <div 
      className="relative w-full rounded-2xl bg-slate-900/80 border border-cyan-500/20 backdrop-blur-md p-4 overflow-hidden shadow-2xl transition-all duration-300 hover:border-cyan-400/40 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-950/30 via-slate-900/60 to-emerald-950/20 pointer-events-none" />
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative z-10 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Globe className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90 block">3D Climate Radar</span>
            <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              {cityName}{country ? `, ${country}` : ''}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsRotating(!isRotating)}
            className={`p-1.5 rounded-lg border text-xs font-medium transition-all ${
              isRotating
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title={isRotating ? 'Pause rotation' : 'Auto rotate'}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Container */}
      <div className="relative w-full h-64 sm:h-72 flex items-center justify-center cursor-grab active:cursor-grabbing">
        <div ref={mountRef} className="w-full h-full" />

        {/* Hover Hint Overlay */}
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-800 shadow-lg pointer-events-none">
          <Compass className="w-3 h-3 text-cyan-400" />
          <span>Drag to rotate • Tap pin to select</span>
        </div>

        {/* Active Weather Overlay Tag */}
        {temperature !== undefined && (
          <div className="absolute top-2 right-2 z-10 bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded-xl px-3 py-1.5 text-right shadow-xl">
            <div className="text-xs text-slate-400 font-medium">{condition || 'Live'}</div>
            <div className="text-lg font-bold text-white tracking-tight">
              {Math.round(temperature)}°{unit}
            </div>
            <div className="text-[9px] text-emerald-400 flex items-center justify-end gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {lat.toFixed(2)}°, {lon.toFixed(2)}°
            </div>
          </div>
        )}
      </div>

      {/* Global Hotspots Bar */}
      <div className="relative z-10 mt-2 pt-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">Global Stations:</span>
        {GLOBAL_HUBS.slice(1).map((hub) => (
          <button
            key={hub.name}
            onClick={() => onSelectCoordinates && onSelectCoordinates(hub.lat, hub.lon, hub.name)}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-slate-700/50 hover:border-cyan-500/30 whitespace-nowrap transition-all flex items-center gap-1"
          >
            <Navigation className="w-2.5 h-2.5 text-cyan-400" />
            {hub.name}
          </button>
        ))}
      </div>
    </div>
  );
};
