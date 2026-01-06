//Class for handling the overall mesh and rig
import {MeshGeometry} from "./MeshGeometry";
import {Mat4} from "../../lib/tsm/Mat4";
import {Vec3} from "../../lib/tsm/Vec3";
import {Bone} from "./Bone";
import {Mat3} from "../../lib/tsm/Mat3";
import {MeshLoader} from "../AnimationFileLoader";
import {Quat} from "../../lib/tsm/Quat";
import {Vec4} from "../../lib/tsm/Vec4";

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

  public rotateBone(bone_idx: number, q_delta: Quat) {
    let bone = this.bones[bone_idx];
    bone.R = q_delta.toMat3().multiply(bone.R);
    this.propagateRot(bone);
  }

  private propagateRot(bone: Bone) {
    let children: Bone[] = [];
    children.push(bone);
    while (children.length > 0) {
      bone = children.pop() as Bone;
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