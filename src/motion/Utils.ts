import {Vec4} from "../lib/tsm/Vec4";
import {Vec3} from "../lib/tsm/Vec3";

export function vec4ToString(vertex : Vec4) {
    return `(${vertex.x}, ${vertex.y}, ${vertex.z}, ${vertex.w})`;
}

export function vec3ToString(vertex : Vec3) {
    return `(${vertex.x}, ${vertex.y}, ${vertex.z})`;
}