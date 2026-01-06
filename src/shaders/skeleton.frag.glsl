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