export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {

        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;

export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;
        /* Determine which color square the position is in */
        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) < 0.5 ? vec3(218.0, 215.0, 229.0) / 256.0 : vec3(187, 182, 208) / 256.0;

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = (clamp(dot_nl, 0.0, 1.0) + 1.0) * 0.7;
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
        // gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
`;

export const quadVSText = `
    precision mediump float;

    attribute vec2 aPosition;
    attribute vec2 aPositionBottom;
    attribute vec2 aTexCoord;
    
    attribute float texIndex;
    varying float vTexIndex;
    
    varying vec2 vTexCoord;
    varying vec2 vPos;
    
    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0); // Directly in clip space
        vTexCoord = aTexCoord;
        vPos = aPosition;
        vTexIndex = texIndex;
    }
`

export const quadFSText = `
    precision mediump float;

    varying vec2 vTexCoord;
    varying vec2 vPos;
    varying float vTexIndex;
    
    uniform sampler2D uTexture0;
    uniform sampler2D uTexture1;
    uniform sampler2D uTexture2;
    uniform sampler2D uTexture3;
    uniform int selectedTex;
    
    void main() {
        float ratio = 2.0 * float(240)/float(800);
        float mult = selectedTex == int(vTexIndex) ? 0.2 : 0.0;
        if (vPos.y > 1.0 - ratio) {
            gl_FragColor = texture2D(uTexture0, vTexCoord) + mult;
        } else if (vPos.y > 1.0 - 2.0*ratio) {
            gl_FragColor = texture2D(uTexture1, vTexCoord) + mult;
        } else if (vPos.y > 1.0 - 3.0*ratio) {
            gl_FragColor = texture2D(uTexture2, vTexCoord) + mult;
        } else {
            gl_FragColor = texture2D(uTexture3, vTexCoord) + mult;
        }
    }
`

export const sceneVSText = `
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
    uniform vec3 jTrans[256];
    uniform vec4 jRots[256];

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

`;

export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    void main () {
        float dot_nl = dot(normalize(lightDir), normal);
	      dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * (vec3(216., 213., 227.)/256.0), 0.0, 1.0), 1.0);
        // gl_FragColor = vec4((normal.x + 1.0)/2.0, (normal.y + 1.0)/2.0, (normal.z + 1.0)/2.0,1.0);
    }
`;



export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;
    varying float vBoneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 bTrans[256];
    uniform vec4 bRots[256];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        vBoneIndex = boneIndex;
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
    }
`;

export const skeletonFSText = `
    precision mediump float;
    varying float vBoneIndex;
    uniform int selectedBone;

    void main () {
        vec3 defaultColor = vec3(1.0, 0.0, 0.0); // Blue
        vec3 highlightColor = vec3(0.0, 0.0, 1.0); // Red
    
        if (int(vBoneIndex) == selectedBone) {
            gl_FragColor = vec4(highlightColor, 1.0);
        } else {
            gl_FragColor = vec4(defaultColor, 1.0);
        }
    }
`;


export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;

export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        if (abs(uv.y-.33) < .003 || abs(uv.y-.67) < .003) {
            gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        }
    }

`;