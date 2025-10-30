import {Debugger} from "../lib/webglutils/Debugging.js";
import {CanvasAnimation} from "../lib/webglutils/CanvasAnimation.js";
import {Floor} from "../lib/webglutils/Floor.js";
import {GUI} from "./Gui.js";
import {FPSCounter} from "./ui/Menu";
import {
  floorFSText,
  floorVSText,
  quadFSText,
  quadVSText,
  sBackFSText,
  sBackVSText,
  sceneFSText,
  sceneVSText,
  skeletonFSText,
  skeletonVSText
} from "./Shaders";
import {Mat3, Mat4, Vec3, Vec4} from "../lib/TSM.js";
import {CLoader} from "./AnimationFileLoader";
import {RenderPass} from "../lib/webglutils/RenderPass";
import {vec3ToString} from "./Utils";

export class SkinningAnimation extends CanvasAnimation {
  private gui: GUI;
  private millis: number;

  private loadedScene!: string;

  /* Floor Rendering Info */
  private floor: Floor;
  private floorRenderPass: RenderPass;

  /* Scene rendering info */
  private scene: CLoader;
  private sceneRenderPass: RenderPass;

  /* Skeleton rendering info */
  private skeletonRenderPass: RenderPass;

  private kfTextureRenderPasses: RenderPass[];

  private keyframeRenderPass: RenderPass;
  private kfPanelRenderPass!: RenderPass;
  private kfLen: number;
  private kfOrthoProjMat!: Mat3;
  private kfQuadVertices: Vec3[];
  private kfQuadTextures: WebGLTexture[];
  private kfQuadIndices: number[];
  private selectedTextureIdx: number;
  private panelOffsetY: number;

  private TARGET_TEXTURE_HEIGHT;
  private TARGET_TEXTURE_WIDTH;

  /* Scrub bar background rendering info */
  private sBackRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private ctx2: CanvasRenderingContext2D | null;

  // Dynamic dimension constants
  public readonly PANEL_WIDTH = 320;
  public readonly STATUS_BAR_HEIGHT = 200;
  private mainCanvasWidth: number;
  private mainCanvasHeight: number;

  private fpsCounter: FPSCounter = new FPSCounter();


  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;

    // Calculate dynamic dimensions
    this.mainCanvasWidth = window.innerWidth - this.PANEL_WIDTH;
    this.mainCanvasHeight = window.innerHeight;

    // Set canvas dimensions dynamically
    canvas.width = this.mainCanvasWidth + this.PANEL_WIDTH;
    canvas.height = this.mainCanvasHeight;
    this.canvas2d.width = canvas.width;
    this.canvas2d.height = canvas.height;

    this.ctx2 = this.canvas2d.getContext("2d");
    if (this.ctx2) {
      this.ctx2.font = "25px serif";
      this.ctx2.fillStyle = "#ffffffff";
    }

    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;

    this.floor = new Floor();
    this.kfLen = 0;
    this.kfTextureRenderPasses = [];
    this.kfQuadVertices = [];
    this.kfQuadTextures = [];
    this.kfQuadIndices = [];
    this.selectedTextureIdx = -1;
    this.panelOffsetY = 0;
    this.setKfOrthoMatrix(0);
    this.TARGET_TEXTURE_HEIGHT = 320;
    this.TARGET_TEXTURE_WIDTH = 240;

    this.floorRenderPass = new RenderPass(this.extVAO, gl, floorVSText, floorFSText);
    this.sceneRenderPass = new RenderPass(this.extVAO, gl, sceneVSText, sceneFSText);
    this.skeletonRenderPass = new RenderPass(this.extVAO, gl, skeletonVSText, skeletonFSText);
    this.keyframeRenderPass = new RenderPass(this.extVAO, gl, sceneVSText, sceneFSText);

    this.gui = new GUI(this.canvas2d, this);
    this.lightPosition = new Vec4([-10, 10, -10, 1]);
    this.backgroundColor = new Vec4([216., 213., 227., 256.]).scale(1/256);

    this.initFloor();
    this.scene = new CLoader("");

    // Status bar
    this.sBackRenderPass = new RenderPass(this.extVAO, gl, sBackVSText, sBackFSText);

    this.initGui();

    this.millis = new Date().getTime();

    // Handle window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize(): void {
    this.mainCanvasWidth = window.innerWidth - this.PANEL_WIDTH;
    this.mainCanvasHeight = window.innerHeight;

    this.canvas2d.width = this.mainCanvasWidth + this.PANEL_WIDTH;
    this.canvas2d.height = this.mainCanvasHeight;

    // Update WebGL viewport
    this.ctx.viewport(0, 0, this.canvas2d.width, this.canvas2d.height);
  }

  public getScene(): CLoader {
    return this.scene;
  }

  public setKfOrthoMatrix(offsetY: number) {
    let r = this.PANEL_WIDTH;
    let l = 0;
    this.panelOffsetY += offsetY;
    if(this.panelOffsetY <= 0) {
      this.panelOffsetY = 0;
    }
    let t = this.panelOffsetY;
    let b = this.mainCanvasHeight + this.panelOffsetY;
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

  /**
   * Setup the animation. This can be called again to reset the animation.
   */
  public reset(): void {
    this.gui.reset();
    this.setScene(this.loadedScene);
  }

  public initGui(): void {

    // Status bar background
    let verts = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
    this.sBackRenderPass.setIndexBufferData(new Uint32Array([1, 0, 2, 2, 0, 3]))
    this.sBackRenderPass.addAttribute("vertPosition", 2, this.ctx.FLOAT, false,
      2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, verts);

    this.sBackRenderPass.setDrawData(this.ctx.TRIANGLES, 6, this.ctx.UNSIGNED_INT, 0);
    this.sBackRenderPass.setup();

  }

  public initScene(): void {
    if (this.scene.meshes.length === 0) { return; }
    this.kfQuadVertices = [];
    this.kfQuadIndices = [];
    this.kfQuadTextures = [];
    this.kfTextureRenderPasses = [];
    this.kfLen = 0;
    this.selectedTextureIdx = -1;
    this.initModel();
    this.initSkeleton();
    this.gui.reset();
  }

  public getKfQuadVertices() {
    return this.kfQuadVertices;
  }

  /**
   * Sets up the mesh and mesh drawing
   */
  public initModel(): void {
    this.sceneRenderPass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);

    let faceCount = this.scene.meshes[0].geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    this.sceneRenderPass.setIndexBufferData(fIndices);

    this.sceneRenderPass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.normal.values);
    if (this.scene.meshes[0].geometry.uv) {
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.uv.values);
    } else {
      this.sceneRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(this.scene.meshes[0].geometry.normal.values.length));
    }

    this.sceneRenderPass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinIndex.values);
    this.sceneRenderPass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinWeight.values);
    this.sceneRenderPass.addAttribute("v0", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v0.values);
    this.sceneRenderPass.addAttribute("v1", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v1.values);
    this.sceneRenderPass.addAttribute("v2", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v2.values);
    this.sceneRenderPass.addAttribute("v3", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v3.values);

    this.sceneRenderPass.addUniform("lightPosition",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      });
    this.sceneRenderPass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(new Mat4().setIdentity().all()));
      });
    this.sceneRenderPass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.sceneRenderPass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.sceneRenderPass.addUniform("jTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform3fv(loc, this.scene.meshes[0].getBoneTranslations());
      });
    this.sceneRenderPass.addUniform("jRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.scene.meshes[0].getBoneRotations());
      });
    this.sceneRenderPass.addUniform("jDs",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, this.scene.meshes[0].getDMatrices());
      });
    this.sceneRenderPass.addUniform("jInvUs",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, this.scene.meshes[0].getInvUMatrices());
      });

    this.sceneRenderPass.setDrawData(this.ctx.TRIANGLES, this.scene.meshes[0].geometry.position.count, this.ctx.UNSIGNED_INT, 0);
    this.sceneRenderPass.setup();
  }

  /**
   * Sets up the skeleton drawing
   */
  public initSkeleton(): void {
    this.skeletonRenderPass.setIndexBufferData(this.scene.meshes[0].getBoneIndices());

    this.skeletonRenderPass.addAttribute("vertPosition", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBonePositions());
    this.skeletonRenderPass.addAttribute("boneIndex", 1, this.ctx.FLOAT, false,
      1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].getBoneIndexAttribute());

    this.skeletonRenderPass.addUniform("mWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
      });
    this.skeletonRenderPass.addUniform("mProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.skeletonRenderPass.addUniform("mView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.skeletonRenderPass.addUniform("bTrans",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform3fv(loc, this.getScene().meshes[0].getBoneTranslations());
      });
    this.skeletonRenderPass.addUniform("bRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.getScene().meshes[0].getBoneRotations());
      });
    this.skeletonRenderPass.addUniform("selectedBone",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        if (loc) {
          gl.uniform1i(loc, this.gui.getSelectedBone());
        } else {
          console.warn("Uniform 'selectedBone' not found or has been optimized out.");
        }
      });

    this.skeletonRenderPass.setDrawData(this.ctx.LINES,
      this.scene.meshes[0].getBoneIndices().length, this.ctx.UNSIGNED_INT, 0);
    this.skeletonRenderPass.setup();
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

  public setKfTexture(idx: number): void {
    this.kfQuadTextures[idx] = this.initializeTexture();
    this.kfTextureRenderPasses[idx] = this.initSceneRenderPass(idx);
  }

  public deleteKfTexture(): void {
    if (this.selectedTextureIdx > -1 && this.selectedTextureIdx < this.kfLen) {
      this.kfQuadTextures.splice(this.selectedTextureIdx, 1);
      this.kfLen -= 1;
      this.drawKfCanvas();
    }
  }

  public drawKfCanvas() {
    let gl = this.ctx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const KF_HEIGHT = 240;
    const PADDING = 5
    gl.viewport(this.canvas2d.width - this.PANEL_WIDTH, 0, this.PANEL_WIDTH, this.canvas2d.height);
    this.kfQuadVertices = [];
    for (let i = 0; i < this.scene.meshes[0].keyframes.length; i++) {
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
    this.kfPanelRenderPass.setIndexBufferData(quadIndices);

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
      this.floorRenderPass.draw();
      this.kfTextureRenderPasses[idx].draw();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public initSceneRenderPass(idx: number) {
    let renderpass = new RenderPass(this.extVAO, this.ctx, sceneVSText, sceneFSText);

    let faceCount = this.scene.meshes[0].geometry.position.count / 3;
    let fIndices = new Uint32Array(faceCount * 3);
    for (let i = 0; i < faceCount * 3; i += 3) {
      fIndices[i] = i;
      fIndices[i + 1] = i + 1;
      fIndices[i + 2] = i + 2;
    }
    renderpass.setIndexBufferData(fIndices);
    renderpass.addAttribute("aNorm", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.normal.values);
    if (this.scene.meshes[0].geometry.uv) {
      renderpass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.uv.values);
    } else {
      renderpass.addAttribute("aUV", 2, this.ctx.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(this.scene.meshes[0].geometry.normal.values.length));
    }

    renderpass.addAttribute("skinIndices", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinIndex.values);
    renderpass.addAttribute("skinWeights", 4, this.ctx.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.skinWeight.values);
    renderpass.addAttribute("v0", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v0.values);
    renderpass.addAttribute("v1", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v1.values);
    renderpass.addAttribute("v2", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v2.values);
    renderpass.addAttribute("v3", 3, this.ctx.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.scene.meshes[0].geometry.v3.values);

    renderpass.addUniform("lightPosition",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
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
        gl.uniform3fv(loc, this.scene.meshes[0].getBoneTranslationsKf(idx));
      });
    renderpass.addUniform("jRots",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.scene.meshes[0].getBoneRotationsKf(idx));
      });

    renderpass.setDrawData(this.ctx.TRIANGLES, this.scene.meshes[0].geometry.position.count, this.ctx.UNSIGNED_INT, 0);
    renderpass.setup();
    return renderpass;
  }

  /**
   * Sets up the floor drawing
   */
  public initFloor(): void {
    this.floorRenderPass.setIndexBufferData(this.floor.indicesFlat());
    this.floorRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.floor.positionsFlat()
    );

    this.floorRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      });
    this.floorRenderPass.addUniform("uWorld",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(Mat4.identity.all()));
      });
    this.floorRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });
    this.floorRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    this.floorRenderPass.addUniform("uProjInv",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().inverse().all()));
      });
    this.floorRenderPass.addUniform("uViewInv",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().inverse().all()));
      });

    this.floorRenderPass.setDrawData(this.ctx.TRIANGLES, this.floor.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.floorRenderPass.setup();
  }


  /** @internal
   * Draws a single frame
   *
   */
  public draw(): void {
    // Update skeleton state
    this.fpsCounter.update();
    let curr = new Date().getTime();
    let deltaT = curr - this.millis;
    this.millis = curr;
    deltaT /= 1000;
    this.getGUI().incrementTime(deltaT);

    if (this.ctx2) {
      this.ctx2.clearRect(0, 0, this.ctx2.canvas.width, this.ctx2.canvas.height);
      if (this.scene.meshes.length > 0) {
        this.ctx2.fillStyle = "#000000";
        this.ctx2.fillText(this.getGUI().getModeString(), 50, this.mainCanvasHeight - 90);
      }
    }

    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const sceneHeight = this.mainCanvasHeight - this.STATUS_BAR_HEIGHT;
    this.drawScene(0, this.STATUS_BAR_HEIGHT, this.mainCanvasWidth, sceneHeight);

    /* Draw status bar */
    if (this.scene.meshes.length > 0) {
      gl.viewport(0, 0, this.mainCanvasWidth, this.STATUS_BAR_HEIGHT);
      this.sBackRenderPass.draw();
    }

  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    this.floorRenderPass.draw();

    /* Draw Scene */
    if (this.scene.meshes.length > 0) {
      this.sceneRenderPass.draw();
      gl.disable(gl.DEPTH_TEST);
      this.skeletonRenderPass.draw();
      gl.viewport(this.mainCanvasWidth, 0, this.PANEL_WIDTH, this.mainCanvasHeight);
      if (this.scene.meshes[0].keyframes.length > this.kfLen) {
        this.setKfTexture(this.kfLen);
        this.kfLen += 1;
      }
      if (this.scene.meshes[0].keyframes.length > 0) {
        this.drawKfCanvas();
        for (let i = 0; i < this.kfTextureRenderPasses.length; i++) {
          this.drawKfTexture(i);
        }
        this.drawKfCanvas();
        this.kfPanelRenderPass.draw();
      }
    }
  }

  public getGUI(): GUI {
    return this.gui;
  }

  /**
   * Loads and sets the scene from a Collada file
   * @param fileLocation URI for the Collada file
   */
  public setScene(fileLocation: string): void {
    this.loadedScene = fileLocation;
    this.scene = new CLoader(fileLocation);
    this.scene.load(() => this.initScene());
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: SkinningAnimation = new SkinningAnimation(canvas);
  canvasAnimation.start();
  canvasAnimation.setScene("./static/assets/skinning/split_cube.dae");
}