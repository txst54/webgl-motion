precision mediump float;

attribute vec3 vertPosition;
attribute float boneIndex;
varying float vBoneIndex;

uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

uniform vec3 bTrans[64];
uniform vec4 bRots[64];

vec3 qtrans(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

void main () {
    int index = int(boneIndex);
    vBoneIndex = boneIndex;
    gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
}