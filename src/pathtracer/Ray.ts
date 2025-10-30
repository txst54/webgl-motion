import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import {Bone} from "./Scene";

export class Ray {
    private readonly origin: Vec4;
    private readonly dir: Vec4;

    constructor(origin: Vec3, dir: Vec3) {
        this.origin = new Vec4([...origin.xyz, 1]);
        this.dir = new Vec4([...dir.xyz, 0]);
    }

    public getDir() {
        return this.dir;
    }

    public getOrigin() {
        return this.origin;
    }

    public intersectBone(bone: Bone, t: number[]): boolean {
        let localOrigin = new Vec4();
        let localDir = new Vec4();
        let tInv = bone.getUniformRotateTransform();
        tInv.multiplyVec4(this.origin, localOrigin);
        tInv.multiplyVec4(this.dir, localDir);


        let px = localOrigin.x;
        let py = localOrigin.y;
        let dx = localDir.x;
        let dy = localDir.y;

        // Quadratic equation coefficients for at^2 + bt + c = 0
        let r = 0.05;
        let a = dx * dx + dy * dy;
        let b = 2 * (px * dx + py * dy);
        let c = px * px + py * py - (r * r);

        // Compute discriminant
        let discriminant = b * b - 4 * a * c;

        if (discriminant < 0) {
            return false;
        }

        // Compute the two possible t values
        let sqrtD = Math.sqrt(discriminant);
        let t1 = (-b - sqrtD) / (2 * a);
        let t2 = (-b + sqrtD) / (2 * a);

        const t1z = localDir.scale(t1).add(localOrigin).z
        const t2z = localDir.scale(t2).add(localOrigin).z
        // @ts-ignore
        // const len = new Vec3(new Vec4(bone.T.col(3)).xyz).length();
        if (t1 >= 0 && t1 <= t2 && t1z >= 0 && t1z <= 1) {
            t[0] = t1;
            return true;
        }
        if (t2 >= 0 && t2 <= t1 && t2z >= 0 && t2z <= 1) {
            t[0] = t2;
            return true;
        }
        return false;
    }

    public intersectPlane(v: Vec3, p: Vec3) {
        const t = Vec3.dot(v, (new Vec3(this.origin.xyz)).subtract(p)) / Vec3.dot(v, new Vec3(this.dir.xyz));
        return this.origin.add(this.dir.copy().scale(t));
    }

    public printRay() {
        console.log(`direction: ${this.getDir().x}, ${this.getDir().y}, ${this.getDir().z}\n position: ${this.getOrigin().x}, ${this.getOrigin().y}, ${this.getOrigin().z}`);
    }

}