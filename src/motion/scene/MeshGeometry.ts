//Class for handling mesh vertices and skin weights
import {Attribute} from "./Attribute";
import {MeshGeometryLoader} from "../AnimationFileLoader";

export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv!: Attribute | null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) {
      this.uv = new Attribute(mesh.uv);
    }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }


}