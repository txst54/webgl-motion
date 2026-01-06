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