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