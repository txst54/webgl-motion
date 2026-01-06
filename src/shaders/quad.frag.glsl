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
    float ratio = 2.0 * float(320)/float(800);
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