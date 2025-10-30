import {Mat3, Mat4, Quat, Vec3, Vec4} from "../lib/TSM.js";
import {AttributeLoader, BoneLoader, MeshGeometryLoader, MeshLoader} from "./AnimationFileLoader.js";
import {vec3ToString, vec4ToString} from "./Utils.js";
import {Quaternion} from "../lib/threejs/src/math/Quaternion";

//TODO: Generate cylinder geometry for highlighting bones

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }


}

//Class for handling bones in the skeleton rig
export class Bone {
  public parent!: number;
  public children!: number[];
  public position!: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint!: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation!: Quat; // current orientation of the joint *with respect to world coordinates*
  public R!: Mat3;
  public U!: Mat4;
  public D!: Mat4;
  public T!: Mat4;
  public T_n!: Mat4;
  public local_position!: Vec4;
  public local_endpoint!: Vec4;
  public length!: number;

  constructor(bone: BoneLoader) {
    if (bone != null) {
      this.parent = bone.parent;
      this.children = Array.from(bone.children);
      this.position = bone.position.copy();
      this.endpoint = bone.endpoint.copy();
      this.rotation = bone.rotation.copy();
    }
  }

  instantiateTransforms(bones: Bone[]) {
    let baseU: Mat4;
    // console.log(this.parent + " " + vec3ToString(this.position) + vec3ToString(this.endpoint));
    let parent = bones[this.parent];
    this.T_n = new Mat4([1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      this.endpoint.x - this.position.x, this.endpoint.y - this.position.y, this.endpoint.z - this.position.z, 1]);
    if (this.parent == -1) {
      this.T = new Mat4([1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        this.position.x, this.position.y, this.position.z, 1]);
      this.U = this.T.copy();
      this.D = this.T.copy();
    } else {
      this.T = new Mat4([1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        this.position.x - parent.position.x, this.position.y - parent.position.y, this.position.z - parent.position.z, 1]);
      this.U = bones[this.parent].U.copy().multiply(this.T);
      this.D = this.U.copy();
    }
    this.R = Mat3.identity.copy();
    let pos4 = new Vec4([...this.position.xyz, 1]);
    let end4 = new Vec4([...this.endpoint.xyz, 1]);
    this.local_position = this.U.copy().inverse().multiplyVec4(pos4);
    this.local_endpoint = this.U.copy().multiply(this.T_n).inverse().multiplyVec4(end4);
    // console.log(vec4ToString(this.local_position) + " " + vec4ToString(this.local_endpoint));
    for (let child_idx of this.children) {
      bones[child_idx].instantiateTransforms(bones);
    }
  }

  getUniformRotateTransform() {
    let dir = new Vec3();
    this.endpoint.subtract(this.position, dir);
    let length = dir.length();
    let localZ = new Vec3([0, 0, 1]);
    let axis = Vec3.cross(dir, localZ);
    dir.normalize();
    axis.normalize();
    let angle = Math.acos(Vec3.dot(localZ, dir));
    // console.log(angle);
    let rotationMatrix = Mat4.identity.copy();
    if (Math.abs(angle) < 1e-6 || Math.abs(angle - Math.PI) < 1e-6) {
      // console.log("Edging");
      if (Math.abs(angle - Math.PI) < 1e-6) {
        // 180 degree rotation, just flip z
        rotationMatrix = new Mat4(
          [1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, -1, 0,
          0, 0, 0, 1]);
      }
    } else {
      Mat4.identity.rotate(angle, axis, rotationMatrix);
    }

    let translationMatrix = new Mat4([1, 0, 0, 0,
                                                    0, 1, 0, 0,
                                                    0, 0, 1, 0,
                                                    -this.position.x, -this.position.y, -this.position.z, 1]);

    let scaleMatrix = new Mat4([1, 0, 0, 0,
                                              0, 1, 0, 0,
                                              0, 0, 1/length, 0,
                                              0, 0, 0, 1]);
    // let pos4 = new Vec4([...this.position.xyz, 1]);
    // let end4 = new Vec4([...this.endpoint.xyz, 1]);
    // console.log(vec4ToString(pos4) + " -> " + vec4ToString(transform.multiplyVec4(pos4)));
    // console.log(vec4ToString(end4) + " -> " + vec4ToString(transform.multiplyVec4(end4)));
    return scaleMatrix.copy().multiply(rotationMatrix.copy().multiply(translationMatrix));
  }

}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;
  public keyframes: Mat3[][];

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;
  private boneRootIndices: number[];

  private kfBonePositions: Float32Array[];
  private kfBoneRotations: Float32Array[];

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    this.bones = [];
    mesh.bones.forEach(bone => {
      this.bones.push(new Bone(bone));
    });
    this.boneRootIndices = [];
    this.bones.forEach((bone, index) => {
      if (bone.parent == -1) {
        bone.instantiateTransforms(this.bones);
        this.boneRootIndices.push(index);
      }
    })
    console.log("Num Bones: " + this.bones.length);
    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);

    this.kfBoneRotations = [];
    this.kfBonePositions = [];
    // console.log(`v0: ${this.geometry.v0.values} ${this.geometry.v0.count} ${this.geometry.v0.itemSize}`)
    // console.log(this.geometry.normal.values);
    this.keyframes = [];
  }

  //TODO: Create functionality for bone manipulation/key-framing

  public rotateBone(bone_idx: number, q_delta:Quat) {
    let bone = this.bones[bone_idx];
    bone.R =q_delta.toMat3().multiply(bone.R);
    this.propagateRot(bone);
  }

  private propagateRot(bone: Bone) {
    let children: Bone[] = [];
    children.push(bone);
    while (children.length > 0) {
      bone = children.pop();
      if (bone.parent != -1) {
        bone.D = this.bones[bone.parent].D.copy().multiply(bone.T.copy().multiply(bone.R.toMat4()));
      } else {
        bone.D = bone.T.copy().multiply(bone.R.toMat4());
      }
      bone.rotation = bone.D.toMat3().toQuat();
      bone.position = new Vec3(bone.D.multiplyVec4(new Vec4([0, 0, 0, 1])).xyz);
      bone.endpoint = new Vec3(bone.D.copy().multiply(bone.T_n).multiplyVec4(new Vec4([0, 0, 0, 1])).xyz);

      for (let child_idx of bone.children) {
        let child = this.bones[child_idx];
        children.push(child);
      }
    }
  }

  public rollBone(bone_idx: number, theta: number) {
    let bone = this.bones[bone_idx];
    let axis = bone.endpoint.subtract(bone.position);
    let R_ = Mat3.identity.copy().rotate(theta, axis);
    let q_delta = R_.toQuat();
    this.rotateBone(bone_idx, q_delta);
  }

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public addKeyFrame(idx: number) {
    let keyframe = [];
    for (let bone of this.bones) {
      keyframe.push(bone.R.copy());
    }
    let kfstr = "[";
    keyframe.forEach((r: Mat3) => {
      kfstr = kfstr.concat("[", r.all().toString(), "], ")
    })
    kfstr = kfstr.concat("]")
    console.log(kfstr)
    this.kfBoneRotations.push(this.getBoneRotations());
    this.kfBonePositions.push(this.getBonePositions());
    this.keyframes[idx] = keyframe;
  }

  public deleteKeyFrame(idx: number) {
    this.keyframes.splice(idx, 1);
  }

  public setFrame(idx: number) {
    this.bones.forEach((bone, i) => {
      bone.R = this.keyframes[idx][i].copy();
    });
    this.boneRootIndices.forEach((idx) => {
      this.propagateRot(this.bones[idx]);
    });
  }

  public getBoneTranslations(): Float32Array {
    let trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneTranslationsKf(idx: number): Float32Array {
    return this.kfBonePositions[idx];
  }

  public getBoneRotationsKf(idx: number): Float32Array {
    return this.kfBoneRotations[idx];
  }

  public getBoneRotations(): Float32Array {
    let trans = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        trans[4 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getDMatrices(): Float32Array {
    let matrices = new Float32Array(16 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.D;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          matrices[4 * index + i * 4 + j] = res.col(i)[j];
        }
      }
    });
    return matrices;
  }

  // return U^-1 for ease of access in shader
  public getInvUMatrices(): Float32Array {
    let matrices = new Float32Array(16 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.U.copy().inverse();
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          matrices[4 * index + i * 4 + j] = res.col(i)[j];
        }
      }
    });
    return matrices;
  }

  public setBonePos(t: number) {
    if (Math.ceil(t) >= this.keyframes.length) {
      return
    }
    let lower_frames = this.keyframes[Math.floor(t)];
    let upper_frames = this.keyframes[Math.ceil(t)];
    for (let i = 0; i < this.bones.length; i++) {
      let bone = this.bones[i];
      let l_frame = lower_frames[i];
      let u_frame = upper_frames[i];
      bone.R = Quat.slerp(l_frame.toQuat(), u_frame.toQuat(), t - Math.floor(t)).toMat3();
    }
    this.boneRootIndices.forEach((idx) => {
      this.propagateRot(this.bones[idx]);
    });
  }
}