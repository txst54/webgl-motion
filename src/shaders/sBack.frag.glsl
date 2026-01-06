precision mediump float;

varying vec2 uv;

void main () {
    gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
    if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
        gl_FragColor = vec4(1, 1, 1, 1);
    }
}