precision mediump float;

attribute vec2 vertPosition;

varying vec2 uv;

void main() {
    gl_Position = vec4(vertPosition, 0.0, 1.0);
    uv = vertPosition;
    uv.x = (1.0 + uv.x) / 2.0;
    uv.y = (1.0 + uv.y) / 2.0;
}