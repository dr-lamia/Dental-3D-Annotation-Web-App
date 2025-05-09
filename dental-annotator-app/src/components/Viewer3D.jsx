// src/components/Viewer3D.jsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

export default function Viewer3D({ modelPath }) {
  const mountRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const sceneRef = useRef(null);
  const [annotationMeshes, setAnnotationMeshes] = useState([]);
  const [movingPoint, setMovingPoint] = useState(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let mesh;

    const loader = new STLLoader();
    loader.load(modelPath, (geometry) => {
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    const handleClick = async (event) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children);

      if (movingPoint) {
        if (intersects.length > 0 && intersects[0].object === mesh) {
          const point = intersects[0].point;
          movingPoint.data.x = point.x;
          movingPoint.data.y = point.y;
          movingPoint.data.z = point.z;
          movingPoint.sphere.position.copy(point);
          movingPoint.labelSprite.position.copy(point).add(new THREE.Vector3(1, 1, 1));
          setMovingPoint(null);
          setAnnotations([...annotations]);
        }
        return;
      }

      const clickedAnnotation = annotationMeshes.find(obj => obj.sphere === intersects[0]?.object);
      if (clickedAnnotation) {
        const action = prompt('Edit label, type DELETE to remove, or MOVE to relocate:', clickedAnnotation.data.label);
        if (action === null) return;
        if (action.toUpperCase() === 'DELETE') {
          scene.remove(clickedAnnotation.sphere);
          scene.remove(clickedAnnotation.labelSprite);
          setAnnotations(prev => prev.filter(a => a !== clickedAnnotation.data));
          setAnnotationMeshes(prev => prev.filter(m => m !== clickedAnnotation));
        } else if (action.toUpperCase() === 'MOVE') {
          setMovingPoint(clickedAnnotation);
        } else {
          clickedAnnotation.data.label = action;
          scene.remove(clickedAnnotation.labelSprite);
          const newSprite = makeTextSprite(action);
          newSprite.position.copy(clickedAnnotation.sphere.position).add(new THREE.Vector3(1, 1, 1));
          scene.add(newSprite);
          clickedAnnotation.labelSprite = newSprite;
          setAnnotations([...annotations]);
        }
        return;
      }

      if (intersects.length > 0 && intersects[0].object === mesh) {
        const point = intersects[0].point;
        const label = prompt('Enter a label for this point (e.g., tooth number):');
        if (label === null) return;

        const annotatedPoint = { x: point.x, y: point.y, z: point.z, label };
        setAnnotations((prev) => [...prev, annotatedPoint]);

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.5),
          new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        sphere.position.copy(point);
        scene.add(sphere);

        const sprite = makeTextSprite(label);
        sprite.position.copy(point).add(new THREE.Vector3(1, 1, 1));
        scene.add(sprite);

        setAnnotationMeshes(prev => [...prev, { data: annotatedPoint, sphere, labelSprite: sprite }]);
      }
    };

    renderer.domElement.addEventListener('click', handleClick);

    const animate = function () {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.domElement.removeEventListener('click', handleClick);
      mountRef.current.removeChild(renderer.domElement);
    };
  }, [modelPath, annotations, movingPoint]);

  const makeTextSprite = (message) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '20px Arial';
    context.fillStyle = 'white';
    context.fillText(message, 0, 20);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    return new THREE.Sprite(spriteMaterial);
  };

  const renderAnnotationSpheres = (points) => {
    if (!sceneRef.current) return;
    const meshes = [];
    points.forEach((point) => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.5),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      sphere.position.set(point.x, point.y, point.z);
      sceneRef.current.add(sphere);

      let sprite;
      if (point.label) {
        sprite = makeTextSprite(point.label);
        sprite.position.set(point.x + 1, point.y + 1, point.z + 1);
        sceneRef.current.add(sprite);
      }
      meshes.push({ data: point, sphere, labelSprite: sprite });
    });
    setAnnotationMeshes(meshes);
  };

  const exportAnnotations = () => {
    const blob = new Blob([JSON.stringify(annotations)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.json';
    a.click();
  };

  const saveToBackend = async () => {
    const blob = new Blob([JSON.stringify(annotations)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, 'annotations.json');

    try {
      const response = await fetch('https://dental-backend.onrender.com/upload', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      alert('Saved: ' + result.filename);
    } catch (error) {
      console.error('Error saving to backend:', error);
    }
  };

  const loadFromBackend = async () => {
    try {
      const response = await fetch('https://dental-backend.onrender.com/annotations');
      const files = await response.json();
      if (files.length > 0) {
        const fileResponse = await fetch(`https://dental-backend.onrender.com/annotations/${files[0]}`);
        const data = await fileResponse.json();
        setAnnotations(data);
        renderAnnotationSpheres(data);
      }
    } catch (error) {
      console.error('Error loading annotations:', error);
    }
  };

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%', height: '80vh' }} />
      <div style={{ marginTop: '10px' }}>
        <button onClick={exportAnnotations}>Export Annotations</button>
        <button onClick={saveToBackend} style={{ marginLeft: '10px' }}>Save to Backend</button>
        <button onClick={loadFromBackend} style={{ marginLeft: '10px' }}>Load from Backend</button>
      </div>
    </div>
  );
}
