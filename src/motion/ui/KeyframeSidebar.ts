import { RenderPass } from "../../lib/webglutils/RenderPass";
import {Mat3, Mat4, Vec3, Vec4} from "../../lib/TSM.js";
import {quadFSText, quadVSText, sceneFSText, sceneVSText} from "../Shaders";
import { CLoader } from "../AnimationFileLoader";
import {GUI} from "./Gui";
import {Scene} from "../scene/Scene";
import {CanvasBounds} from "./CanvasBounds";

export class KeyframeSidebar {
  private ctx: WebGL2RenderingContext;
  private extVAO: any;
  private scene: Scene;
  private bounds: CanvasBounds;

  private kfTextureRenderPasses: RenderPass[];
  private kfPanelRenderPass!: RenderPass;
  private kfLen: number;
  private kfOrthoProjMat!: Mat3;
  private kfQuadVertices: Vec3[];
  private kfQuadTextures: WebGLTexture[];
  private kfQuadIndices: number[];
  private selectedTextureIdx: number;
  private panelOffsetY: number;

  private readonly TARGET_TEXTURE_HEIGHT = 320;
  private readonly TARGET_TEXTURE_WIDTH = 240;
  private readonly KF_HEIGHT = 240;
  private readonly PADDING = 5;
  public readonly PANEL_WIDTH = 320;

  private gui: GUI;

  private keyframeRenderPass: RenderPass;

  constructor(
    ctx: WebGL2RenderingContext,
    extVAO: any,
    scene: Scene,
    gui: GUI,
    bounds: CanvasBounds
  ) {
    this.ctx = ctx;
    this.extVAO = extVAO;
    this.scene = scene;
    this.bounds = bounds;
    this.gui = gui;

    this.kfLen = 0;
    this.kfTextureRenderPasses = [];
    this.kfQuadVertices = [];
    this.kfQuadTextures = [];
    this.kfQuadIndices = [];
    this.selectedTextureIdx = -1;
    this.panelOffsetY = 0;
    this.setKfOrthoMatrix(0);

    this.keyframeRenderPass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);
  }

  public reset() {
    this.kfQuadVertices = [];
    this.kfQuadIndices = [];
    this.kfQuadTextures = [];
    this.kfTextureRenderPasses = [];
    this.kfLen = 0;
    this.selectedTextureIdx = -1;
  }

  private initializeTexture() {
    let gl = this.ctx;
    const targetTextureWidth = this.TARGET_TEXTURE_WIDTH;
    const targetTextureHeight = this.TARGET_TEXTURE_HEIGHT;
    let targetTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    {
      const level = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data = null;
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        targetTextureWidth, targetTextureHeight, border,
        format, type, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return targetTexture;
  }

  private initSceneRenderPass(idx: number) {
    let renderpass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);

    let faceCount = this.scene.getScene().meshes[0].geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    renderpass.setIndexBufferData(fIndices);
    renderpass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.normal.values);
    if (this.scene.getScene().meshes[0].geometry.uv) {
      renderpass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.uv?.values
        || new Float32Array(this.scene.getScene().meshes[0].geometry.normal.values.length));
    } else {
      renderpass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(this.scene.getScene().meshes[0].geometry.normal.values.length));
    }

    renderpass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.skinIndex.values);
    renderpass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.skinWeight.values);
    renderpass.addAttribute("v0", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.v0.values);
    renderpass.addAttribute("v1", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.v1.values);
    renderpass.addAttribute("v2", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.v2.values);
    renderpass.addAttribute("v3", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.getScene().meshes[0].geometry.v3.values);

    renderpass.addUniform("lightPosition",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.scene.getLightPosition().xyzw);
      });
    renderpass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
      });
    renderpass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    renderpass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    renderpass.addUniform("jTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform3fv(loc, this.scene.getScene().meshes[0].getBoneTranslationsKf(idx));
      });
    renderpass.addUniform("jRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.scene.getScene().meshes[0].getBoneRotationsKf(idx));
      });

    renderpass.setDrawData(this.ctx.TRIANGLES, this.scene.getScene().meshes[0].geometry.position.count, this.ctx.UNSIGNED_INT, 0);
    renderpass.setup();
    return renderpass;
  }

  public setKfTexture(idx: number): void {
    this.kfQuadTextures[idx] = this.initializeTexture();
    this.kfTextureRenderPasses[idx] = this.initSceneRenderPass(idx);
  }

  public drawKfCanvas() {
    let gl = this.ctx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const KF_HEIGHT = 240;
    const PADDING = 5
    gl.viewport(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    this.kfQuadVertices = [];
    for (let i = 0; i < this.scene.getScene().meshes[0].keyframes.length; i++) {
      const startY = i * KF_HEIGHT;
      const quadCoordsWorld = [
        new Vec3([2 * PADDING, startY + PADDING, 1]),
        new Vec3([this.PANEL_WIDTH - 2 * PADDING, startY + PADDING, 1]),
        new Vec3([2 * PADDING, KF_HEIGHT + startY - PADDING, 1]),
        new Vec3([this.PANEL_WIDTH - 2 * PADDING, KF_HEIGHT + startY - PADDING, 1])];
      quadCoordsWorld.forEach((qcoord) => {
        let qscreen = this.kfOrthoProjMat.multiplyVec3(qcoord);
        this.kfQuadVertices.push(qscreen);
      });
    }
    let tmparr: number[] = [];
    let tmptex: number[] = [];
    let tmpind: number[] = [];
    let ii = 0;
    this.kfQuadIndices = [];
    for (let i = 0; i < this.kfQuadVertices.length; i+= 4) {
      tmparr = tmparr.concat(
        [
          this.kfQuadVertices[i].x,  this.kfQuadVertices[i].y,  0.0, 1.0,
          this.kfQuadVertices[i+1].x,  this.kfQuadVertices[i+1].y,  1.0, 1.0,
          this.kfQuadVertices[i+2].x,  this.kfQuadVertices[i+2].y,  0.0, 0.0,
          this.kfQuadVertices[i+3].x,  this.kfQuadVertices[i+3].y,  1.0, 0.0
        ]
      );
      if (this.kfQuadVertices[i].y >= -1 && this.kfQuadVertices[i].y <= 1) {
        if (ii >= 4) {
        }
        gl.activeTexture(gl.TEXTURE0 + ii);
        gl.bindTexture(gl.TEXTURE_2D, this.kfQuadTextures[i/4]);
        this.kfQuadIndices.push(i/4);
        ii += 1;
      } else {
        this.kfQuadIndices.push(0);
      }
      tmpind = tmpind.concat([i, 2+i, 1+i, 2+i, 3+i, 1+i]);
      tmptex = tmptex.concat([i/4, i/4, i/4, i/4]);
    }
    const quadVertices = new Float32Array(tmparr);
    const quadTexIndices = new Float32Array(tmptex);

    const quadIndices = new Uint16Array(tmpind);
    const quadIndices32 = new Uint32Array(tmpind);

    this.kfPanelRenderPass = new RenderPass(this.extVAO, this.ctx, quadVSText, quadFSText);
    this.kfPanelRenderPass.setIndexBufferData(quadIndices32);

    this.kfPanelRenderPass.addAttribute("aPosition", 2, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, quadVertices);
    this.kfPanelRenderPass.addAttribute("aTexCoord", 2, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT, undefined, quadVertices);
    this.kfPanelRenderPass.addUniform("uTexture0",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1i(loc, 0);
      });
    this.kfPanelRenderPass.addAttribute("texIndex",1, this.ctx.FLOAT, false,
      1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, quadTexIndices);
    this.kfPanelRenderPass.addUniform("selectedTex",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1i(loc, this.selectedTextureIdx);
      });
    this.kfPanelRenderPass.addUniform("uTexture1",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1i(loc, 1);
      });
    this.kfPanelRenderPass.addUniform("uTexture2",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1i(loc, 2);
      });
    this.kfPanelRenderPass.addUniform("uTexture3",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1i(loc, 3);
      });

    this.kfPanelRenderPass.setDrawData(this.ctx.TRIANGLES, quadIndices.length, this.ctx.UNSIGNED_SHORT, 0);
    this.kfPanelRenderPass.setup();
  }

  public drawKfTexture(idx: number) {
    let gl = this.ctx;
    const targetTextureHeight = this.TARGET_TEXTURE_HEIGHT;
    const targetTextureWidth = this.TARGET_TEXTURE_WIDTH;
    const fb = gl.createFramebuffer();
    const targetTexture = this.kfQuadTextures[idx];
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    const level = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, targetTexture, level);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    {
      gl.viewport(0, 0, targetTextureWidth, targetTextureHeight);
      gl.clearColor(0.1, 0.12, 0.15, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.scene.getFloorRenderPass().draw();
      this.kfTextureRenderPasses[idx].draw();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public deleteKfTexture(): void {
    if (this.selectedTextureIdx > -1 && this.selectedTextureIdx < this.kfLen) {
      this.kfQuadTextures.splice(this.selectedTextureIdx, 1);
      this.kfLen -= 1;
      this.drawKfCanvas();
    }
  }

  public setKfOrthoMatrix(offsetY: number) {
    let r = this.PANEL_WIDTH;
    let l = 0;
    this.panelOffsetY += offsetY;
    if(this.panelOffsetY <= 0) {
      this.panelOffsetY = 0;
    }
    let t = this.panelOffsetY;
    let b = this.bounds.y + this.bounds.height + this.panelOffsetY;
    this.kfOrthoProjMat = new Mat3(
      [2/(r-l), 0, 0,
        0, 2/(t-b), 0,
        -(r+l)/(r-l), -(t+b)/(t-b), 0]
    );
  }

  public setSelectedTexture(idx: number): void {
    this.selectedTextureIdx = idx;
  }

  public getSelectedTexture(): number {
    return this.selectedTextureIdx;
  }

  public getKfQuadVertices() {
    return this.kfQuadVertices;
  }

  public draw() {
    const scene = this.scene.getScene();
    if (scene.meshes.length == 0) { return; }
    const gl = this.ctx;
    gl.viewport(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    if (scene.meshes[0].keyframes.length > this.kfLen) {
      this.setKfTexture(this.kfLen);
      this.kfLen += 1;
    }
    if (scene.meshes[0].keyframes.length > 0) {
      this.drawKfCanvas();
      for (let i = 0; i < this.kfTextureRenderPasses.length; i++) {
        this.drawKfTexture(i);
      }
      this.drawKfCanvas();
      this.kfPanelRenderPass.draw();
    }
  }
}