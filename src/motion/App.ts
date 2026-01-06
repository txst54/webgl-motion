import {Debugger} from "../lib/webglutils/Debugging.js";
import {CanvasAnimation} from "../lib/webglutils/CanvasAnimation.js";
import {GUI} from "./ui/Gui";
import {FPSCounter} from "./ui/Menu";
import {
  sBackFSText,
  sBackVSText,
} from "./Shaders";
import {Mat3, Mat4, Vec3, Vec4} from "../lib/TSM.js";
import {CLoader} from "./AnimationFileLoader";
import {RenderPass} from "../lib/webglutils/RenderPass";
import {vec3ToString} from "./Utils";
import {KeyframeSidebar} from "./ui/KeyframeSidebar";
import {Scene} from "./scene/Scene";
import {CanvasBounds} from "./ui/CanvasBounds";
import {Camera} from "../lib/webglutils/Camera";

export class SkinningAnimation extends CanvasAnimation {
  private gui: GUI;
  private scene: Scene;
  private keyframeSidebar: KeyframeSidebar;
  private fpsCounter: FPSCounter = new FPSCounter();
  protected extVAO: any;
  private camera!: Camera;

  private millis: number;

  private loadedScene!: string;

  /* Scrub bar background rendering info */
  private sBackRenderPass: RenderPass;

  private canvas2d: HTMLCanvasElement;
  private ctx2: CanvasRenderingContext2D | null;
  private backgroundColor: Vec4 = new Vec4([0.9, 0.9, 0.9, 1.0]);

  // Dynamic dimension constants
  public readonly PANEL_WIDTH = 150;
  public readonly STATUS_BAR_HEIGHT = 200;


  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    this.canvas2d.width = this.canvas2d.clientWidth;
    this.canvas2d.height = this.canvas2d.clientHeight;
    console.log(this.canvas2d.width, this.canvas2d.height);
    const sceneBounds: CanvasBounds = {
      x: 0,
      y: this.STATUS_BAR_HEIGHT,
      width: this.canvas2d.width - this.PANEL_WIDTH,
      height: this.canvas2d.height - this.STATUS_BAR_HEIGHT
    };
    const keyframeSidebarBounds: CanvasBounds = {
      x: this.canvas2d.width - this.PANEL_WIDTH,
      y: 0,
      width: this.PANEL_WIDTH,
      height: this.canvas2d.height
    }

    // Set canvas dimensions dynamically
    canvas.width = this.canvas2d.width;
    canvas.height = this.canvas2d.height;

    this.ctx2 = this.canvas2d.getContext("2d");
    if (this.ctx2) {
      this.ctx2.font = "25px serif";
      this.ctx2.fillStyle = "#ffffffff";
    }

    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;

    this.gui = new GUI(this.canvas2d, this);
    this.scene = new Scene(
      this.ctx,
      this.extVAO,
      sceneBounds,
      this.gui
    );
    this.keyframeSidebar = new KeyframeSidebar(
      this.ctx,
      this.extVAO,
      this.scene,
      this.gui,
      keyframeSidebarBounds
    );

    // Status bar
    this.sBackRenderPass = new RenderPass(this.extVAO, gl, sBackVSText, sBackFSText);

    this.initGui();

    this.millis = new Date().getTime();

    // Handle window resize
    // window.addEventListener('resize', () => this.handleResize());
  }

  // private handleResize(): void {
  //   this.mainCanvasWidth = window.innerWidth - this.PANEL_WIDTH;
  //   this.mainCanvasHeight = window.innerHeight;
  //
  //   this.canvas2d.width = this.mainCanvasWidth + this.PANEL_WIDTH;
  //   this.canvas2d.height = this.mainCanvasHeight;
  //
  //   // Update WebGL viewport
  //   this.ctx.viewport(0, 0, this.canvas2d.width, this.canvas2d.height);
  // }

  public getScene(): CLoader {
    return this.scene.getScene();
  }

  /**
   * Setup the animation. This can be called again to reset the animation.
   */
  public reset(): void {
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

  public getKeyframeSidebar(): KeyframeSidebar {
    return this.keyframeSidebar;
  }


  /** @internal
   * Draws a single frame
   *
   */
  public draw(): void {
    if (this.scene.getScene().meshes.length == 0) { return; }
    // Update skeleton state
    this.fpsCounter.update();
    let curr = new Date().getTime();
    let deltaT = curr - this.millis;
    this.millis = curr;
    deltaT /= 1000;
    this.getGUI().incrementTime(deltaT);

    if (this.ctx2) {
      this.ctx2.clearRect(0, 0, this.ctx2.canvas.width, this.ctx2.canvas.height);
      this.ctx2.fillStyle = "#000000";
      this.ctx2.fillText(this.getGUI().getModeString(), 50, this.canvas2d.height - 90);
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
    this.scene.draw();
    this.keyframeSidebar.draw();

    /* Draw status bar */
    if (this.scene.getScene().meshes.length > 0) {
      gl.viewport(0, 0, this.scene.getSceneBounds().width, this.STATUS_BAR_HEIGHT);
      this.sBackRenderPass.draw();
    }

  }

  public setScene(path: string): void {
    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.scene.getSceneBounds().width / this.scene.getSceneBounds().height,
      0.1,
      1000.0
    );
    this.scene.setScene(path, this.camera);
    this.gui.reset(this.camera);
    this.keyframeSidebar.reset();
    this.loadedScene = path;
  }

  public getGUI(): GUI {
    return this.gui;
  }

  public getSceneObject(): Scene {
    return this.scene;
  }

  public getKeyframeSidebarObject(): KeyframeSidebar {
    return this.keyframeSidebar;
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: SkinningAnimation = new SkinningAnimation(canvas);
  canvasAnimation.start();
  canvasAnimation.setScene("./static/assets/skinning/split_cube.dae");
}