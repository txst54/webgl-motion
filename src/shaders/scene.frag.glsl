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