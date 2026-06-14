import * as THREE from "three";
export class World {
    scene : THREE.Scene;
    camera : THREE.PerspectiveCamera;
    renderer : THREE.WebGLRenderer;

    constructor() {
        const canvas = document.getElementById("three-canvas");
        const container = document.querySelector(".canvas-frame");

        if (canvas === null || container == null) {
            throw Error("Canvas or container null");
        }

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            75,
            container.clientWidth / container.clientHeight,
            0.01,
            100
        );

        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true
        });

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;


        this.renderer.setSize(container.clientWidth, container.clientHeight, false);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.renderer.shadowMap.enabled = true;

        const groundGeometry = new THREE.PlaneGeometry(50, 50, 5, 5);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        this.scene.add(groundMesh);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;


        const pointLight = new THREE.PointLight(0xffffff, 30, 20, 1);
        pointLight.position.set(0, 13, 0);
        pointLight.shadow.autoUpdate = true;
        pointLight.castShadow = true;
        this.scene.add(pointLight);

        const frontSpotLight = new THREE.SpotLight(0xffffff, 20);
        frontSpotLight.position.set(0, 8, 7)
        frontSpotLight.lookAt(0,1,0)
        frontSpotLight.castShadow = true;
        frontSpotLight.shadow.autoUpdate = true;

        this.scene.add(new THREE.AmbientLight( 0x505050 ));

        this.scene.add(frontSpotLight);

        this.camera.position.set(-3, 7, 10);
        this.camera.lookAt(0, 1, 0);
    }

    resizeRenderer() {
        const canvas = document.getElementById("three-canvas");
        const container = document.querySelector(".canvas-frame");

        if (canvas === null || container == null) {
            throw Error("Canvas or container null");
        }

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}