export type TetMeshJson = {
    points: number[];
    tets: number[];
};

export async function loadTetMeshJson(url: string) : Promise<TetMeshJson> {
    const response = await fetch(url);

    if (!response.ok){
        throw new Error(`Failed to load ${url}: ${response.status}`);
    }

    return (await response.json()) as Promise<TetMeshJson>;
}

type Face = number[];
type FaceInfo = {
    face : Face,
    count: number
};
type FaceMap = Map<string, FaceInfo>;

function addToFaceMap(face: Face, map : FaceMap) {
    if (face.length != 3) {
        throw new Error("Face must have 3 elements!");
    }
    const sortedFace = [face[0], face[1], face[2]].sort((x, y) => x-y);
    const key = `${sortedFace[0]}_${sortedFace[1]}_${sortedFace[2]}`
    const existing = map.get(key);
    if (existing !== undefined) {
        existing.count++;
    } else {
        map.set(key, {face: face, count : 1})
    }
}

export function getSurfaceTriangles(tetMesh : TetMeshJson) : number[] {
    let faceMap : FaceMap = new Map();
    for (let i = 0; i < tetMesh.tets.length; i += 4) {
        const A = tetMesh.tets[i];
        const B = tetMesh.tets[i+1];
        const C = tetMesh.tets[i+2];
        const D = tetMesh.tets[i+3];

        const Face1 : Face = [A, B, C];
        const Face2 : Face = [B, A, D];
        const Face3 : Face = [C, D, A];
        const Face4 : Face = [C, B, D];
        addToFaceMap(Face1, faceMap);
        addToFaceMap(Face2, faceMap);
        addToFaceMap(Face3, faceMap);
        addToFaceMap(Face4, faceMap);
    }

    let surfaceTriangles : number[] = []

    faceMap.forEach((faceInfo, _) => {
        if (faceInfo.count === 1) {
            surfaceTriangles.push(faceInfo.face[0]);
            surfaceTriangles.push(faceInfo.face[1]);
            surfaceTriangles.push(faceInfo.face[2]);
        }

    });

    return surfaceTriangles;
}