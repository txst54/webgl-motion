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