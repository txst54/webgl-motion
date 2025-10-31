//Class for handling bones in the skeleton rig
import {Vec3} from "../../lib/tsm/Vec3";
import {Quat} from "../../lib/tsm/Quat";
import {Mat3} from "../../lib/tsm/Mat3";
import {Mat4} from "../../lib/tsm/Mat4";
import {Vec4} from "../../lib/tsm/Vec4";
import {BoneLoader} from "../AnimationFileLoader";

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
      0, 0, 1 / length, 0,
      0, 0, 0, 1]);
    // let pos4 = new Vec4([...this.position.xyz, 1]);
    // let end4 = new Vec4([...this.endpoint.xyz, 1]);
    // console.log(vec4ToString(pos4) + " -> " + vec4ToString(transform.multiplyVec4(pos4)));
    // console.log(vec4ToString(end4) + " -> " + vec4ToString(transform.multiplyVec4(end4)));
    return scaleMatrix.copy().multiply(rotationMatrix.copy().multiply(translationMatrix));
  }

}