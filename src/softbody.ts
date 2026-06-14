import * as THREE from "three";
import {Line, Vector3} from "three";

const GRAVITY: Vector3 = new Vector3(0, -9.8, 0);
const ONE_OVER_SIX: number = 1 / 6;

export class Particle {
    constructor(position: THREE.Vector3) {
        this.position = position;
        this.old_position = position.clone();
        this.velocity = new Vector3(0, 0, 0);
    }

    position: THREE.Vector3;
    old_position: THREE.Vector3;
    velocity: THREE.Vector3;
    invMass: number = 1;
}

class EdgeConstraint {
    constructor(p1: number, p2: number, compliance: number = 0.0001) {
        this.p1 = p1;
        this.p2 = p2;
        this.compliance = compliance;
        this.restLength = 0
    }

    p1: number
    p2: number
    compliance: number
    restLength: number

    calculateRestLength(particles: Particle[]) {
        const P1 = particles[this.p1].position;
        const P2 = particles[this.p2].position;
        this.restLength = P1.clone().sub(P2).length();
    }
}

class VolumeConstraint {
    constructor(p1: number, p2: number, p3: number, p4: number, compliance: number = 0.00001) {
        this.p1 = p1;
        this.p2 = p2;
        this.p3 = p3;
        this.p4 = p4;
        this.compliance = compliance
    }

    p1: number;
    p2: number;
    p3: number;
    p4: number;
    compliance: number;
    restVolume: number = 0;

    calculateRestVolume(particles: Particle[]) {
        const A = particles[this.p1].position;
        const B = particles[this.p2].position;
        const C = particles[this.p3].position;
        const D = particles[this.p4].position;

        const BA = B.clone().sub(A);
        const CA = C.clone().sub(A);
        const DA = D.clone().sub(A);

        const cross = BA.cross(CA);
        this.restVolume = cross.dot(DA) * ONE_OVER_SIX;
    }
}


// @ts-ignore
function getDeduplicatedEdgeIndices(
    surfaceIndices: number[]
): { a: number; b: number }[] {

    const edgeSet = new Set<string>();
    const edges: { a: number; b: number }[] = [];

    function addEdge(a: number, b: number) {
        // normalize edge (order-independent)
        const min = Math.min(a, b);
        const max = Math.max(a, b);

        const key = `${min}_${max}`;

        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ a: min, b: max });
        }
    }

    // process triangles
    for (let i = 0; i < surfaceIndices.length; i += 3) {
        const a = surfaceIndices[i];
        const b = surfaceIndices[i + 1];
        const c = surfaceIndices[i + 2];

        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
    }

    return edges;
}


function getDeduplicatedTetEdgeIndices(
    tetIndices: number[]
): { a: number; b: number }[] {

    const edgeSet = new Set<string>();
    const edges: { a: number; b: number }[] = [];

    function addEdge(a: number, b: number) {
        const min = Math.min(a, b);
        const max = Math.max(a, b);

        const key = `${min}_${max}`;

        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ a: min, b: max });
        }
    }

    for (let i = 0; i < tetIndices.length; i += 4) {
        const a = tetIndices[i];
        const b = tetIndices[i + 1];
        const c = tetIndices[i + 2];
        const d = tetIndices[i + 3];

        addEdge(a, b);
        addEdge(a, c);
        addEdge(a, d);
        addEdge(b, c);
        addEdge(b, d);
        addEdge(c, d);
    }

    return edges;
}



export class SoftBody {
    constructor(particles: Particle[], surfaceIndices: number[], tetIndices: number[]) {
        this.particles = particles
        this.surfaceIndices = surfaceIndices;
        this.tetIndices = tetIndices;


        const deduplicatedEdges = getDeduplicatedTetEdgeIndices(this.tetIndices);
        for (let i = 0; i <deduplicatedEdges.length; ++i) {
            this.edgeConstraints.push(new EdgeConstraint(deduplicatedEdges[i].a, deduplicatedEdges[i].b))
        }
        for (let i = 0; i < this.edgeConstraints.length; ++i) {
            this.edgeConstraints[i].calculateRestLength(this.particles);
        }

        for (let i = 0; i < this.tetIndices.length; i += 4) {
            const A = this.tetIndices[i];
            const B = this.tetIndices[i + 1];
            const C = this.tetIndices[i + 2];
            const D = this.tetIndices[i + 3];
            this.volumeConstraints.push(new VolumeConstraint(A, B, C, D));
        }
        for (let i = 0; i < this.volumeConstraints.length; ++i) {
            this.volumeConstraints[i].calculateRestVolume(this.particles);
        }

        this.initializeInverseMassesFromTets();
    }

    particles: Particle[];
    surfaceIndices: number[];
    tetIndices: number[];
    edgeConstraints: EdgeConstraint[] = []
    volumeConstraints: VolumeConstraint[] = []
    mesh: Line | THREE.Mesh | null = null;

    getLineMesh(): Line {
        const material = new THREE.LineBasicMaterial({color: 0x00ff00});
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < this.tetIndices.length; i += 4) {
            const A = this.particles[this.tetIndices[i]].position;
            const B = this.particles[this.tetIndices[i + 1]].position;
            const C = this.particles[this.tetIndices[i + 2]].position;
            const D = this.particles[this.tetIndices[i + 3]].position;
            points.push(A, B, A, C, A, D, B, C, B, D, C, D);
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.mesh = new THREE.LineSegments(geometry, material);
        return this.mesh;
    }

    getSurfaceMesh() {

        // jelly-like material
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xff3355,

            roughness: 0.18,
            metalness: 0.0,

            transmission: 0.35,
            thickness: 1.2,
            ior: 1.35,

            transparent: true,
            opacity: 0.72,

            clearcoat: 1.0,
            clearcoatRoughness: 0.18,

            sheen: 0.6,
            sheenColor: new THREE.Color(0xff99aa),
            sheenRoughness: 0.35,

            side: THREE.DoubleSide,
        });



        const positions = new Float32Array(this.particles.length * 3);

        for (let i = 0; i < this.particles.length; ++i) {
            const p = this.particles[i].position;
            const idx = i * 3;
            positions[idx] = p.x;
            positions[idx + 1] = p.y;
            positions[idx + 2] = p.z;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        geometry.setIndex(this.surfaceIndices);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        return this.mesh;
    }


    translate(delta: THREE.Vector3, resetVelocity: boolean = true) {
        for (const p of this.particles) {
            p.position.add(delta);
            p.old_position.add(delta);

            if (resetVelocity) {
                p.velocity.set(0, 0, 0);
            }
        }
    }


    updateSimulation(dt: number) {

        for (let i = 0; i < this.particles.length; ++i) {
            const p = this.particles[i];
            const dv = GRAVITY.clone().multiplyScalar(dt);
            p.velocity.add(dv);
            p.old_position = p.position.clone();
            const dx = p.velocity.clone().multiplyScalar(dt);
            p.position.add(dx);

            // solve ground
            if (p.position.y < 0) {
                p.position = p.old_position.clone();
                p.position.y = 0;
            }
        }

        // solve edges
        for (let i = 0; i < this.edgeConstraints.length; ++i) {
            const EC = this.edgeConstraints[i];
            const P1 = this.particles[EC.p1];
            const P2 = this.particles[EC.p2];
            const l = P1.position.clone().sub(P2.position).length();
            const C = l - EC.restLength;

            const gradC1 = P1.position.clone().sub(P2.position).normalize();
            const gradC2 = P2.position.clone().sub(P1.position).normalize();

            const lambda = -C / (P1.invMass * gradC1.lengthSq() + P2.invMass * gradC2.lengthSq() + (EC.compliance / (dt * dt)));

            const deltaP1 = gradC1.multiplyScalar(lambda * P1.invMass);
            const deltaP2 = gradC2.multiplyScalar(lambda * P2.invMass);

            P1.position.add(deltaP1);
            P2.position.add(deltaP2);
        }

        // solve volumes
        for (let i = 0; i < this.volumeConstraints.length; ++i) {
            const VC = this.volumeConstraints[i];
            const P1 = this.particles[VC.p1];
            const P2 = this.particles[VC.p2];
            const P3 = this.particles[VC.p3];
            const P4 = this.particles[VC.p4];

            const P21 = P2.position.clone().sub(P1.position);
            const P31 = P3.position.clone().sub(P1.position);
            const P41 = P4.position.clone().sub(P1.position);

            const V = P21.clone().cross(P31).dot(P41) / 6.0;

            const C = V - VC.restVolume;

            const P42 = P4.position.clone().sub(P2.position);
            const P32 = P3.position.clone().sub(P2.position);

            const gradC1 = P42.clone().cross(P32).multiplyScalar(1 / 6);
            const gradC2 = P31.clone().cross(P41).multiplyScalar(1 / 6);
            const gradC3 = P41.clone().cross(P21).multiplyScalar(1 / 6);
            const gradC4 = P21.clone().cross(P31).multiplyScalar(1 / 6);

            const lambda = -C /
                (P1.invMass * gradC1.lengthSq()
                    + P2.invMass * gradC2.lengthSq()
                    + P3.invMass * gradC3.lengthSq()
                    + P4.invMass * gradC4.lengthSq()
                    + (VC.compliance / (dt * dt)));

            const deltaP1 = gradC1.multiplyScalar(lambda * P1.invMass);
            const deltaP2 = gradC2.multiplyScalar(lambda * P2.invMass);
            const deltaP3 = gradC3.multiplyScalar(lambda * P3.invMass);
            const deltaP4 = gradC4.multiplyScalar(lambda * P4.invMass);

            P1.position.add(deltaP1);
            P2.position.add(deltaP2);
            P3.position.add(deltaP3);
            P4.position.add(deltaP4);
        }


        for (let i = 0; i < this.particles.length; ++i) {
            const p = this.particles[i];
            p.velocity = (p.position.clone().sub(p.old_position)).divideScalar(dt);
        }

    }


    initializeInverseMassesFromTets() {
        for (const p of this.particles) {
            p.invMass = 0;
        }

        for (let i = 0; i < this.tetIndices.length; i += 4) {
            const id0 = this.tetIndices[i];
            const id1 = this.tetIndices[i + 1];
            const id2 = this.tetIndices[i + 2];
            const id3 = this.tetIndices[i + 3];

            const A = this.particles[id0].position;
            const B = this.particles[id1].position;
            const C = this.particles[id2].position;
            const D = this.particles[id3].position;

            const volume = B.clone()
                .sub(A)
                .cross(C.clone().sub(A))
                .dot(D.clone().sub(A)) / 6.0;

            if (volume <= 0) {
                continue;
            }

            const tetMass = volume;
            const particleMass = tetMass / 4.0;
            const particleInvMass = 1.0 / particleMass;

            this.particles[id0].invMass += particleInvMass;
            this.particles[id1].invMass += particleInvMass;
            this.particles[id2].invMass += particleInvMass;
            this.particles[id3].invMass += particleInvMass;
        }
    }


    updateMesh() {
        if (this.mesh == null) {
            return;
        }
        if (this.mesh instanceof Line) {
            const positionAttribute = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
            const array = positionAttribute.array as Float32Array;
            let ptr = 0;
            for (let i = 0; i < this.tetIndices.length; i += 4) {
                const A = this.particles[this.tetIndices[i]].position;
                const B = this.particles[this.tetIndices[i + 1]].position;
                const C = this.particles[this.tetIndices[i + 2]].position;
                const D = this.particles[this.tetIndices[i + 3]].position;

                const verts = [A, B, A, C, A, D, B, C, B, D, C, D];

                for (const v of verts) {
                    array[ptr++] = v.x;
                    array[ptr++] = v.y;
                    array[ptr++] = v.z;
                }

            }
            positionAttribute.needsUpdate = true;
        } else if (this.mesh instanceof THREE.Mesh) {

            const positionAttribute = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
            const array = positionAttribute.array as Float32Array;

            for (let i = 0; i < this.particles.length; ++i) {
                const p = this.particles[i].position;
                const idx = i * 3;

                array[idx] = p.x;
                array[idx + 1] = p.y;
                array[idx + 2] = p.z;
            }

            positionAttribute.needsUpdate = true;

            this.mesh.geometry.computeVertexNormals();
            this.mesh.geometry.computeBoundingSphere();
            this.mesh.geometry.computeBoundingBox();

        }

    }



    static createCube(
        size: number = 1,
        resolution: number = 2,
        transform?: THREE.Matrix4
    ): SoftBody {
        const particles: Particle[] = [];
        const surfaceIndices: number[] = [];
        const tetIndices: number[] = [];

        const half = size / 2;
        const step = size / (resolution - 1);

        const index = (x: number, y: number, z: number) =>
            x + resolution * (y + resolution * z);

        // particles
        for (let z = 0; z < resolution; z++) {
            for (let y = 0; y < resolution; y++) {
                for (let x = 0; x < resolution; x++) {
                    const pos = new THREE.Vector3(
                        -half + x * step,
                        -half + y * step,
                        -half + z * step
                    );

                    if (transform) {
                        pos.applyMatrix4(transform);
                    }

                    particles.push(new Particle(pos));
                }
            }
        }

        // FRONT face, +Z
        {
            const z = resolution - 1;

            for (let y = 0; y < resolution - 1; y++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const a = index(x, y, z);
                    const b = index(x + 1, y, z);
                    const c = index(x + 1, y + 1, z);
                    const d = index(x, y + 1, z);

                    surfaceIndices.push(a, b, c, a, c, d);
                }
            }
        }

        // BACK face, -Z
        {
            const z = 0;

            for (let y = 0; y < resolution - 1; y++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const a = index(x, y, z);
                    const b = index(x + 1, y, z);
                    const c = index(x + 1, y + 1, z);
                    const d = index(x, y + 1, z);

                    surfaceIndices.push(a, c, b, a, d, c);
                }
            }
        }

        // TOP face, +Y
        {
            const y = resolution - 1;

            for (let z = 0; z < resolution - 1; z++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const a = index(x, y, z);
                    const b = index(x + 1, y, z);
                    const c = index(x + 1, y, z + 1);
                    const d = index(x, y, z + 1);

                    surfaceIndices.push(a, b, c, a, c, d);
                }
            }
        }

        // BOTTOM face, -Y
        {
            const y = 0;

            for (let z = 0; z < resolution - 1; z++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const a = index(x, y, z);
                    const b = index(x + 1, y, z);
                    const c = index(x + 1, y, z + 1);
                    const d = index(x, y, z + 1);

                    surfaceIndices.push(a, c, b, a, d, c);
                }
            }
        }

        // RIGHT face, +X
        {
            const x = resolution - 1;

            for (let z = 0; z < resolution - 1; z++) {
                for (let y = 0; y < resolution - 1; y++) {
                    const a = index(x, y, z);
                    const b = index(x, y + 1, z);
                    const c = index(x, y + 1, z + 1);
                    const d = index(x, y, z + 1);

                    surfaceIndices.push(a, b, c, a, c, d);
                }
            }
        }

        // LEFT face, -X
        {
            const x = 0;

            for (let z = 0; z < resolution - 1; z++) {
                for (let y = 0; y < resolution - 1; y++) {
                    const a = index(x, y, z);
                    const b = index(x, y + 1, z);
                    const c = index(x, y + 1, z + 1);
                    const d = index(x, y, z + 1);

                    surfaceIndices.push(a, c, b, a, d, c);
                }
            }
        }

        // build tetrahedrons
        for (let z = 0; z < resolution - 1; z++) {
            for (let y = 0; y < resolution - 1; y++) {
                for (let x = 0; x < resolution - 1; x++) {
                    const corners = [
                        index(x, y, z),             // 0
                        index(x + 1, y, z),         // 1
                        index(x + 1, y + 1, z),     // 2
                        index(x, y + 1, z),         // 3
                        index(x, y, z + 1),         // 4
                        index(x + 1, y, z + 1),     // 5
                        index(x + 1, y + 1, z + 1), // 6
                        index(x, y + 1, z + 1),     // 7
                    ];

                    // Split cube cell into 5 tetrahedrons
                    tetIndices.push(
                        corners[0], corners[1], corners[3], corners[4],
                        corners[1], corners[2], corners[3], corners[6],
                        corners[1], corners[3], corners[4], corners[6],
                        corners[1], corners[4], corners[5], corners[6],
                        corners[3], corners[4], corners[6], corners[7]
                    );
                }
            }
        }

        return new SoftBody(particles, surfaceIndices, tetIndices);
    }


}