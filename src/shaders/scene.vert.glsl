precision mediump float;

attribute vec2 aUV;
attribute vec3 aNorm;
attribute vec4 skinIndices;
attribute vec4 skinWeights;

//vertices used for bone weights (assumes up to four weights per vertex)
attribute vec4 v0;
attribute vec4 v1;
attribute vec4 v2;
attribute vec4 v3;

varying vec4 lightDir;
varying vec2 uv;
varying vec4 normal;

uniform vec4 lightPosition;
uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

//Joint translations and rotations to determine weights (assumes up to 64 joints per rig)
uniform vec3 jTrans[64];
uniform vec4 jRots[64];

vec3 qtrans(vec4 q, vec3 v) {
    return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
}

void normalizeDualQuat(inout vec4 real, inout vec4 dual) {
    float mag = length(real);
    real /= mag;
    dual /= mag;
}

vec4 quatMul(vec4 q1, vec4 q2) {
    return vec4(
    q1.w * q2.xyz + q2.w * q1.xyz + cross(q1.xyz, q2.xyz),
    q1.w * q2.w - dot(q1.xyz, q2.xyz)
    );
}

void makeDualQuat(vec4 qRot, vec3 t, out vec4 real, out vec4 dual) {
    real = qRot;
    vec4 tQuat = vec4(t, 0.0);
    dual = 0.5 * quatMul(tQuat, qRot);
}

vec3 transformDualQuat(vec4 real, vec4 dual, vec3 position) {
    vec3 rotated = position + 2.0 * cross(real.xyz, cross(real.xyz, position) + real.w * position);
    vec3 t = 2.0 * (cross(real.xyz, dual.xyz) + real.w * dual.xyz - dual.w * real.xyz);
    return rotated + t;
}

void main () {
    int i0 = int(skinIndices[0]);
    int i1 = int(skinIndices[1]);
    int i2 = int(skinIndices[2]);
    int i3 = int(skinIndices[3]);

    vec4 qr0 = jRots[i0];
    vec4 qr1 = jRots[i1];
    vec4 qr2 = jRots[i2];
    vec4 qr3 = jRots[i3];

    if(dot(qr1, qr0) < 0.0) qr1 = -qr1;
    if(dot(qr2, qr0) < 0.0) qr2 = -qr2;
    if(dot(qr3, qr0) < 0.0) qr3 = -qr3;

    vec4 dq0r, dq0d;
    vec4 dq1r, dq1d;
    vec4 dq2r, dq2d;
    vec4 dq3r, dq3d;

    makeDualQuat(qr0, jTrans[i0], dq0r, dq0d);
    makeDualQuat(qr1, jTrans[i1], dq1r, dq1d);
    makeDualQuat(qr2, jTrans[i2], dq2r, dq2d);
    makeDualQuat(qr3, jTrans[i3], dq3r, dq3d);

    vec4 blendReal = dq0r * skinWeights[0] +
    dq1r * skinWeights[1] +
    dq2r * skinWeights[2] +
    dq3r * skinWeights[3];

    vec4 blendDual = dq0d * skinWeights[0] +
    dq1d * skinWeights[1] +
    dq2d * skinWeights[2] +
    dq3d * skinWeights[3];

    // Normalize blended dual quaternion
    float len = length(blendReal);
    blendReal /= len;
    blendDual /= len;

    // Compute a single vertex bind position from per-joint local coordinates:
    vec3 vBlend = skinWeights[0] * v0.xyz +
    skinWeights[1] * v1.xyz +
    skinWeights[2] * v2.xyz +
    skinWeights[3] * v3.xyz;

    // Transform the bind pose vertex using the blended dual quaternion
    vec3 skinnedPos = transformDualQuat(blendReal, blendDual, vBlend);
    vec4 worldPosition = mWorld * vec4(skinnedPos, 1.0);
    gl_Position = mProj * mView * worldPosition;

    //  Compute light direction and transform to camera coordinates
    lightDir = lightPosition - worldPosition;

    vec3 skinnedNormal = qtrans(blendReal, aNorm);
    normal = normalize(mWorld * vec4(skinnedNormal, 0.0));

    uv = aUV;
}