import * as THREE from "three";
import { Vector3 } from "three";
import { World } from "./world.ts";
import {Particle, SoftBody} from "./softbody.ts";
import {getSurfaceTriangles, loadTetMeshJson, type TetMeshJson} from "./loader.ts";
// @ts-ignore
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import monkeyUrl from "./assets/monkey_data.json?url";
import catUrl from "./assets/cat_data.json?url";
import bunnyUrl from "./assets/bunny_data.json?url";


type ModelId = "cube2" | "cube3" | "cube5" | "cube10" | "monkey" | "cat" | "bunny";
type RenderMode = "surface" | "wireframe" | "tets";


const EDGE_COMPLIANCE_MIN_EXP = -10;
const EDGE_COMPLIANCE_MAX_EXP = -1;

const VOLUME_COMPLIANCE_MIN_EXP = -12;
const VOLUME_COMPLIANCE_MAX_EXP = -2;


const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const dragPlane = new THREE.Plane();
const dragPoint = new THREE.Vector3();
const previousDragPoint = new THREE.Vector3();

let isDraggingSoftBody = false;
let wasPausedBeforeDrag = false;


function updatePointerFromEvent(event: PointerEvent) {
    const rect = world.renderer.domElement.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}


function bindSoftBodyDragging() {
    const canvas = world.renderer.domElement;

    canvas.addEventListener("pointerdown", (event) => {
        if (!softBody?.mesh) return;

        if (!event.shiftKey) return;

        updatePointerFromEvent(event);
        raycaster.setFromCamera(pointer, world.camera);

        const intersections = raycaster.intersectObject(softBody.mesh, true);

        if (intersections.length === 0) {
            return;
        }

        const hitPoint = intersections[0].point;

        isDraggingSoftBody = true;
        wasPausedBeforeDrag = state.isPaused;
        setState({ isPaused: true });

        controls.enabled = false;

        // Create drag plane facing the camera, passing through hit point.
        const cameraDirection = new THREE.Vector3();
        world.camera.getWorldDirection(cameraDirection);

        dragPlane.setFromNormalAndCoplanarPoint(
            cameraDirection.clone().negate(),
            hitPoint
        );

        previousDragPoint.copy(hitPoint);

        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
        if (!isDraggingSoftBody || !softBody) return;

        updatePointerFromEvent(event);

        raycaster.setFromCamera(pointer, world.camera);

        const didHitPlane = raycaster.ray.intersectPlane(dragPlane, dragPoint);

        if (!didHitPlane) {
            return;
        }

        const delta = dragPoint.clone().sub(previousDragPoint);

        softBody.translate(delta, true);
        softBody.updateMesh();

        previousDragPoint.copy(dragPoint);
    });

    function endDrag(event: PointerEvent) {
        if (!isDraggingSoftBody) return;

        isDraggingSoftBody = false;
        controls.enabled = true;

        if (!wasPausedBeforeDrag) {
            setState({ isPaused: false });
        }

        canvas.releasePointerCapture(event.pointerId);
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
}



// Special value: slider minimum means exactly zero compliance.
function sliderToCompliance(
    sliderValue: number,
    minExp: number
): number {
    if (sliderValue <= minExp) {
        return 0;
    }

    return Math.pow(10, sliderValue);
}

function complianceToSlider(
    compliance: number,
    minExp: number
): number {
    if (compliance <= 0) {
        return minExp;
    }

    return Math.log10(compliance);
}

function formatCompliance(value: number): string {
    if (value === 0) {
        return "0";
    }

    return value.toExponential(2);
}


function configureComplianceSliders() {
    ui.edgeSlider.min = EDGE_COMPLIANCE_MIN_EXP.toString();
    ui.edgeSlider.max = EDGE_COMPLIANCE_MAX_EXP.toString();
    ui.edgeSlider.step = "0.1";

    ui.volumeSlider.min = VOLUME_COMPLIANCE_MIN_EXP.toString();
    ui.volumeSlider.max = VOLUME_COMPLIANCE_MAX_EXP.toString();
    ui.volumeSlider.step = "0.1";
}


interface AppState {
    isPaused: boolean;
    model: ModelId;
    resolution: number;
    renderMode: RenderMode;
    edgeCompliance: number;
    volumeCompliance: number;
    solverSubsteps: number;
}

const MODEL_RESOLUTIONS: Record<ModelId, number> = {
    cube2: 2,
    cube3: 3,
    cube5: 5,
    cube10: 10,
    monkey: -1,
    cat: -1,
    bunny: -1
};

const state: AppState = {
    isPaused: false,
    model: "monkey",
    resolution: MODEL_RESOLUTIONS.cube5,
    renderMode: "surface",
    edgeCompliance: 1e-8,
    volumeCompliance: 1e-9,
    solverSubsteps: 8,
};



let wasRunningBeforePageHidden = false;

function autoPauseSimulation() {
    if (!state.isPaused) {
        wasRunningBeforePageHidden = true;
        setState({ isPaused: true });
    }
}

function autoResumeSimulation() {
    if (wasRunningBeforePageHidden) {
        wasRunningBeforePageHidden = false;
        setState({ isPaused: false });
    }

    lastTime = performance.now();
}

function bindPageVisibilityEvents() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            autoPauseSimulation();
        } else {
            autoResumeSimulation();
        }
    });

    window.addEventListener("blur", () => {
        autoPauseSimulation();
    });

    window.addEventListener("focus", () => {
        autoResumeSimulation();
    });
}

const world: World = new World();
let softBody: SoftBody | null = null;

const controls = new OrbitControls(world.camera, world.renderer.domElement);
controls.minDistance = 0.001;

const ui = {
    modelSelect: document.getElementById("model-select") as HTMLSelectElement,
    renderModeSelect: document.getElementById("render-mode") as HTMLSelectElement,

    edgeSlider: document.getElementById("edge-compliance") as HTMLInputElement,
    edgeValue: document.getElementById("edge-value") as HTMLElement,

    volumeSlider: document.getElementById("volume-compliance") as HTMLInputElement,
    volumeValue: document.getElementById("volume-value") as HTMLElement,

    iterationSlider: document.getElementById("substep-count") as HTMLInputElement,
    iterationValue: document.getElementById("substep-value") as HTMLElement,

    fps: document.getElementById("fps") as HTMLElement,
    particleCount: document.getElementById("particle-count") as HTMLElement,
    tetCount: document.getElementById("tet-count") as HTMLElement,

    startButton: document.getElementById("button-start") as HTMLButtonElement,
    pauseButton: document.getElementById("button-pause") as HTMLButtonElement,
    restartButton: document.getElementById("button-restart") as HTMLButtonElement,
};

async function createSoftBody(modelId: ModelId): Promise<SoftBody> {
    const resolution = MODEL_RESOLUTIONS[modelId]

    const transform = new THREE.Matrix4().makeTranslation(0, 8, 0);
    transform.scale(new Vector3(1.5, 1.5, 1.5));


    let body : SoftBody | null = null;
    if (resolution > 0) {
        body = SoftBody.createCube(3, resolution, transform);
    } else  {
        let tetMesh : TetMeshJson
        if (modelId == "monkey") {

            tetMesh = await loadTetMeshJson(monkeyUrl);

            const rot = new THREE.Matrix4().makeRotationX(-Math.PI/ 2);
            transform.multiply(rot);
        } else if (modelId == "cat") {

            tetMesh = await loadTetMeshJson(catUrl);

            const rot = new THREE.Matrix4().makeRotationX(-Math.PI);
            transform.multiply(rot);
        } else {

            tetMesh = await loadTetMeshJson(bunnyUrl);

            const rot = new THREE.Matrix4().makeRotationX(-Math.PI/ 2);
            transform.multiply(rot);
        }

        const surfaceTriangles = getSurfaceTriangles(tetMesh)
        const particles : Particle[] = [];
        for (let i = 0; i <tetMesh.points.length; i+=3) {
            particles.push(new Particle(new Vector3(tetMesh.points[i], tetMesh.points[i+1], tetMesh.points[i+2])))
        }

        for (let i = 0; i < particles.length; ++i) {
            particles[i].position.applyMatrix4(transform);
        }
        body = new SoftBody(particles, surfaceTriangles, tetMesh.tets);
    }

    if (body != null) {
        applySimulationState(body);
        rebuildSoftBodyMesh(body);
    }


    return body;
}

function disposeObject3D(object: THREE.Object3D) {
    object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            child.geometry?.dispose();

            const material = child.material;

            if (Array.isArray(material)) {
                material.forEach((m) => m.dispose());
            } else {
                material?.dispose();
            }
        }
    });
}

function removeSoftBodyFromScene() {
    if (!softBody?.mesh) return;

    world.scene.remove(softBody.mesh);
    disposeObject3D(softBody.mesh);
    softBody.mesh = null;
}

async function replaceSoftBody() {
    removeSoftBodyFromScene();

    softBody = await createSoftBody(state.model);

    if (softBody.mesh) {
        world.scene.add(softBody.mesh);
    }

    syncStatsFromSoftBody();
}

function rebuildSoftBodyMesh(body: SoftBody) {
    if (body.mesh) {
        world.scene.remove(body.mesh);
        disposeObject3D(body.mesh);
        body.mesh = null;
    }

    switch (state.renderMode) {
        case "surface":
            body.mesh = body.getSurfaceMesh();
            break;

        case "wireframe":
            body.mesh = body.getLineMesh();
            break;
    }
}

function applySimulationState(body: SoftBody) {
    body.edgeConstraints?.forEach((constraint) => {
        constraint.compliance = state.edgeCompliance;
    });

    body.volumeConstraints.forEach((constraint) => {
        constraint.compliance = state.volumeCompliance;
    });
}

function syncUiFromState() {
    ui.modelSelect.value = state.model;
    ui.renderModeSelect.value = state.renderMode;

    ui.edgeSlider.value = complianceToSlider(
        state.edgeCompliance,
        EDGE_COMPLIANCE_MIN_EXP
    ).toString();

    ui.edgeValue.textContent = formatCompliance(state.edgeCompliance);

    ui.volumeSlider.value = complianceToSlider(
        state.volumeCompliance,
        VOLUME_COMPLIANCE_MIN_EXP
    ).toString();

    ui.volumeValue.textContent = formatCompliance(state.volumeCompliance);
    ui.iterationValue.textContent = state.solverSubsteps.toString();
    ui.iterationSlider.value = state.solverSubsteps.toString();
}

function syncStatsFromSoftBody() {
    if (!softBody) {
        ui.particleCount.textContent = "0";
        ui.tetCount.textContent = "0";
        return;
    }

    ui.particleCount.textContent = softBody.particles.length.toString();
    ui.tetCount.textContent = (softBody.tetIndices.length / 4).toString();
}

function setState(patch: Partial<AppState>) {
    const previousState = { ...state };

    Object.assign(state, patch);

    syncUiFromState();

    const modelChanged = previousState.model !== state.model;
    const resolutionChanged = previousState.resolution !== state.resolution;
    const renderModeChanged = previousState.renderMode !== state.renderMode;

    if (modelChanged || resolutionChanged) {
        replaceSoftBody();
        return;
    }

    if (!softBody) return;

    if (renderModeChanged) {
        rebuildSoftBodyMesh(softBody);

        if (softBody.mesh) {
            world.scene.add(softBody.mesh);
        }
    }

    applySimulationState(softBody);
}

function bindUiEvents() {
    ui.startButton.addEventListener("click", () => {
        setState({ isPaused: false });
    });

    ui.pauseButton.addEventListener("click", () => {
        setState({ isPaused: true });
    });

    ui.restartButton.addEventListener("click", () => {
        replaceSoftBody();
    });

    ui.modelSelect.addEventListener("change", () => {
        const model = ui.modelSelect.value as ModelId;

        setState({
            model,
            resolution: MODEL_RESOLUTIONS[model],
        });
    });

    ui.renderModeSelect.addEventListener("change", () => {
        setState({
            renderMode: ui.renderModeSelect.value as RenderMode,
        });
    });


    ui.edgeSlider.addEventListener("input", () => {
        const exponent = parseFloat(ui.edgeSlider.value);

        setState({
            edgeCompliance: sliderToCompliance(
                exponent,
                EDGE_COMPLIANCE_MIN_EXP
            ),
        });
    });

    ui.volumeSlider.addEventListener("input", () => {
        const exponent = parseFloat(ui.volumeSlider.value);

        setState({
            volumeCompliance: sliderToCompliance(
                exponent,
                VOLUME_COMPLIANCE_MIN_EXP
            ),
        });
    });


    ui.iterationSlider.addEventListener("input", () => {
        setState({
            solverSubsteps: parseInt(ui.iterationSlider.value, 10),
        });
    });
}

window.addEventListener("resize", () => {
    world.resizeRenderer();
});

bindUiEvents();
bindSoftBodyDragging()
bindPageVisibilityEvents();
configureComplianceSliders();
syncUiFromState();
replaceSoftBody();

controls.update();

let lastTime = 0;
let frameCount = 0;
let fpsTime = 0;

function animate(time: number) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    controls.update();

    frameCount++;
    fpsTime += dt;

    if (fpsTime >= 0.5) {
        ui.fps.textContent = Math.round(frameCount / fpsTime).toString();
        frameCount = 0;
        fpsTime = 0;
    }

    if (!state.isPaused && softBody) {
        const stepDt = dt / state.solverSubsteps;

        for (let i = 0; i < state.solverSubsteps; i++) {
            softBody.updateSimulation(stepDt);
        }

        softBody.updateMesh();
    }

    world.renderer.render(world.scene, world.camera);
}

world.resizeRenderer();
world.renderer.setAnimationLoop(animate);