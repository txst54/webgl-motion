import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import {vec3ToString, vec4ToString} from "./Utils.js";
import { Ray } from "./Ray.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

export enum Mode {
  playback,
  edit
}


/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.05;
  private static readonly zoomSpeed: number = 0.1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera!: Camera;
  private dragging!: boolean;
  private fps!: boolean;
  private prevX: number;
  private prevY: number;

  private height: number;
  private viewPortHeight: number;
  private width: number;

  private animation: SkinningAnimation;

  private selectedBone: number;
  private selectedMesh: number;
  private selectedBoneSub: number;
  private boneDragging!: boolean;

  public time!: number;
  public mode!: Mode;

  public hoverX: number = 0;
  public hoverY: number = 0;

  public kfViewMat!: Mat4;
  public kfProjMat!: Mat4;

  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   * @param sponge required for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: SkinningAnimation) {
    this.animation = animation;

    this.height = canvas.height;
    this.viewPortHeight = this.height - this.animation.STATUS_BAR_HEIGHT;
    this.width = canvas.width - this.animation.PANEL_WIDTH;
    this.prevX = 0;
    this.prevY = 0;
    this.selectedBone = -1;
    this.selectedMesh = -1;
    this.selectedBoneSub = -1;

    this.reset();

    this.registerEventListeners(canvas);
  }

  /**
   * Updates dimensions when canvas is resized
   */
  public updateDimensions(canvas: HTMLCanvasElement): void {
    this.height = canvas.height;
    this.viewPortHeight = this.height - this.animation.STATUS_BAR_HEIGHT;
    this.width = canvas.width - this.animation.PANEL_WIDTH;

    // Update camera aspect ratio
    this.camera.setAspect(this.width / this.viewPortHeight);
  }

  public getNumKeyFrames(): number {
    return this.animation.getScene().meshes[0].keyframes.length;
  }

  public getTime(): number {
    return this.time;
  }

  public getMaxTime(): number {
    return this.animation.getScene().meshes[0].keyframes.length - 1;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.time = 0;
    this.mode = Mode.edit;

    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.viewPortHeight,
      0.1,
      1000.0
    );
    this.kfViewMat = this.camera.viewMatrix().copy();
    this.kfProjMat = this.camera.projMatrix().copy();
  }

  public getKfViewMat() {
    return this.kfViewMat;
  }

  public getKfProjMat() {
    return this.kfProjMat;
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  /**
   * Callback function for the start of a drag event.
   * @param mouse
   */
  public dragStart(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;
    const panelStartX = this.width;

    if (x >= panelStartX) {
      this.dragging = true;
      const x_ndc = (2 * (x - panelStartX)) / this.animation.PANEL_WIDTH - 1;
      const y_ndc = 1 - (2 * y) / this.height;
      if (mouse.buttons == 1) {
        let kfQuadVertices = this.animation.getKfQuadVertices();
        let selectedIdx = -1;
        for (let i = 0; i < kfQuadVertices.length; i+=4) {
          if (kfQuadVertices[i].y >= y_ndc && kfQuadVertices[i+2].y <= y_ndc) {
            selectedIdx = i / 4;
            this.animation.setSelectedTexture(selectedIdx);
            break;
          }
        }
        console.log("selected idx " + selectedIdx);
      }
      return;
    }
    if (mouse.offsetY > this.viewPortHeight) {
      // outside the main panel (in status bar)
      return;
    }

    this.dragging = true;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
  }

  public incrementTime(dT: number): void {
    if (this.mode === Mode.playback) {
      this.time += dT;
      this.animation.getScene().meshes.forEach((mesh) => {
        mesh.setBonePos(this.time);
      });
      if (this.time >= this.getMaxTime()) {
        this.time = 0;
        this.mode = Mode.edit;
      }
    }
  }

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;
    const x_ndc = (2 * x) / this.width - 1;
    const y_ndc = 1 - (2 * y) / this.viewPortHeight;
    const panelStartX = this.width;

    if (this.dragging) {
      const dx = mouse.screenX - this.prevX;
      const dy = mouse.screenY - this.prevY;

      /* Left button, or primary button */
      const mouseDir: Vec3 = this.camera.right();
      mouseDir.scale(-dx);
      mouseDir.add(this.camera.up().scale(dy));
      mouseDir.normalize();

      if (dx === 0 && dy === 0) {
        return;
      }

      switch (mouse.buttons) {
        case 1: {
          if (x >= panelStartX) {
            console.log("Dragging up and down")
            // this.animation.setKfOrthoMatrix(-dy * 0.2);
            // if (this.animation.getScene().meshes[0].keyframes.length > 0) {
            //   this.animation.drawKfCanvas();
            // }
            return;
          }
          let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
          rotAxis = rotAxis.normalize();
          if (this.selectedBone != -1) {
            //generate 2 rays from the camera based off mouse movement
            const ray = this.mouseCameraRay(x_ndc, y_ndc);
            const prev_x_ndc = (2 * this.prevX) / this.width - 1;
            const prev_y_ndc = 1 - (2 * this.prevY) / this.viewPortHeight;
            const rayPrev = this.mouseCameraRay(prev_x_ndc, prev_y_ndc);
            let mesh = this.animation.getScene().meshes[this.selectedMesh];
            const bone_pos = mesh.bones[this.selectedBone].position;
            const bone_endpos = mesh.bones[this.selectedBone].endpoint;
            const planeNormal = Vec3.cross(new Vec3(ray.getDir().xyz), new Vec3(rayPrev.getDir().xyz)).normalize();
            const cameraOrigin = new Vec3(ray.getOrigin().xyz);
            //finds closest point from bone pos to plane made by the 2 rays shot by mouse
            const boneToCam = bone_pos.copy().subtract(cameraOrigin);
            const dist = Vec3.dot(boneToCam, planeNormal);
            const closestP = bone_pos.copy().subtract(planeNormal.scale(dist));
            //finds the closest point on ray to the point found on the plane (this is the target point)
            const t = Vec3.dot(closestP.copy().subtract(cameraOrigin), (new Vec3(ray.getDir().xyz)).normalize());
            const isect = cameraOrigin.copy().add(new Vec3(ray.getDir().xyz).scale(t));

            let q_delta;
            // creates 2 unit vectors bone vector and the target vector
            const vecIsect = (new Vec3(isect.xyz)).subtract(bone_pos).normalize();
            const vecAUnorm = vecIsect.copy().subtract(this.camera.forward().copy().normalize().scale(Vec3.dot(vecIsect, this.camera.forward().copy().normalize())));
            const vecBone = bone_endpos.copy().subtract(bone_pos).normalize();
            const vecBUnorm = vecBone.copy().subtract(this.camera.forward().copy().normalize().scale(Vec3.dot(vecBone, this.camera.forward().copy().normalize())));
            const vecA = vecAUnorm.copy().normalize();
            const vecB = vecBUnorm.copy().normalize();
            let dot = Vec3.dot(vecA, vecB);
            if (vecAUnorm.length() < 1e-3 || vecBUnorm.length() < 1e-3) {
              console.log("edge case");
              q_delta = Quat.fromAxisAngle(vecBone, Math.acos(dot)).normalize();
              mesh.rotateBone(this.selectedBoneSub, q_delta);
            } else {
              const cross = Vec3.cross(vecB, vecA);
              const sign = Vec3.dot(cross, this.camera.forward()) < 0 ? -1 : 1;
              const angleSigned = sign * Math.acos(dot)
              const maxDelta = 0.1;
              const clampedAngle = Math.sign(angleSigned) * Math.min(Math.abs(angleSigned), maxDelta);
              q_delta = Quat.fromAxisAngle(this.camera.forward(), clampedAngle).normalize();
              mesh.rotateBone(this.selectedBoneSub, q_delta);
            }
          } else if (this.fps) {
            this.camera.rotate(rotAxis, GUI.rotationSpeed);
          } else {
            this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
          }

          break;
        }
        case 2: {
          /* Right button, or secondary button */
          this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
          break;
        }
        default: {
          break;
        }
      }
    } else {
      const ray = this.mouseCameraRay(x_ndc, y_ndc);
      let bestT: number = Infinity;
      let isect: boolean = false;
      let closestBone: number | null = null;
      let closestBoneSub: number | null = null;
      let closestMesh: number | null = null;
      let counter = 0;
      for (let j = 0; j < this.animation.getScene().meshes.length; j++) {
        let mesh = this.animation.getScene().meshes[j];
        for (let i = 0; i < mesh.bones.length; i++) {
          let tTemp: number[] = [-1];
          if (ray.intersectBone(mesh.bones[i], tTemp)) {
            if (tTemp[0] < bestT) {
              bestT = tTemp[0];
              closestBone = counter;
              closestBoneSub = i;
              closestMesh = j;
            }
            isect = true;
          }
          counter++;
        }
      }
      if (isect) {
        if (closestBone === null || closestMesh === null || closestBoneSub === null) {
          throw new Error("Closest bone/mesh should not be null here");
        }
        this.selectedBone = closestBone;
        this.selectedMesh = closestMesh;
        this.selectedBoneSub = closestBoneSub;
      } else {
        this.selectedBone = -1;
        this.selectedMesh = -1;
        this.selectedBoneSub = -1;
      }
    }
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
  }

  public getSelectedBone(): number {
    return this.selectedBone;
  }


  public getModeString(): string {
    switch (this.mode) {
      case Mode.edit: { return "edit: " + this.getNumKeyFrames() + " keyframes"; }
      case Mode.playback: { return "playback: " + this.getTime().toFixed(2) + " / " + this.getMaxTime().toFixed(2); }
    }
  }

  /**
   * Callback function for the end of a drag event
   * @param mouse
   */
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
    this.prevX = 0;
    this.prevY = 0;
  }

  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "Digit1": {
        this.animation.setScene("./static/assets/skinning/split_cube.dae");
        break;
      }
      case "Digit2": {
        this.animation.setScene("./static/assets/skinning/long_cubes.dae");
        break;
      }
      case "Digit3": {
        this.animation.setScene("./static/assets/skinning/simple_art.dae");
        break;
      }
      case "Digit4": {
        this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
        break;
      }
      case "Digit5": {
        this.animation.setScene("./static/assets/skinning/robot.dae");
        break;
      }
      case "Digit6": {
        this.animation.setScene("./static/assets/skinning/head.dae");
        break;
      }
      case "Digit7": {
        this.animation.setScene("./static/assets/skinning/hatsune_miku_small (1).dae");
        break;
      }
      case "KeyW": {
        this.camera.offset(
          this.camera.forward().negate(),
          GUI.zoomSpeed,
          true
        );
        break;
      }
      case "KeyA": {
        this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyS": {
        this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyD": {
        this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyR": {
        this.animation.reset();
        break;
      }
      case "ArrowLeft": {
        if (this.selectedBone != -1) {
          let theta = -GUI.rollSpeed;
          let mesh = this.animation.getScene().meshes[this.selectedMesh];
          mesh.rollBone(this.selectedBoneSub, theta);
        } else {
          this.camera.roll(GUI.rollSpeed, false);
        }
        break;
      }
      case "ArrowRight": {
        if (this.selectedBone != -1) {
          let theta = GUI.rollSpeed;
          let mesh = this.animation.getScene().meshes[this.selectedMesh];
          mesh.rollBone(this.selectedBoneSub, theta);
        } else {
          this.camera.roll(GUI.rollSpeed, true);
        }
        break;
      }
      case "ArrowUp": {
        this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
        break;
      }
      case "ArrowDown": {
        this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyK": {
        if (this.mode === Mode.edit) {
          this.animation.getScene().meshes.forEach((mesh, index) => {
            mesh.addKeyFrame(mesh.keyframes.length);
          });
        }
        break;
      }
      case "KeyP": {
        if (this.mode === Mode.edit && this.getNumKeyFrames() > 1)
        {
          this.mode = Mode.playback;
          this.time = 0;
        } else if (this.mode === Mode.playback) {
          this.mode = Mode.edit;
        }
        break;
      }
      case "Delete":
        this.animation.deleteKfTexture();
        this.animation.getScene().meshes.forEach((mesh, index) => {
          mesh.deleteKeyFrame(this.animation.getSelectedTexture());
        });
        this.animation.setSelectedTexture(-1);
        break;
      case "KeyU":
        if (this.animation.getSelectedTexture() != -1) {
          this.animation.getScene().meshes.forEach((mesh, index) => {
            mesh.addKeyFrame(this.animation.getSelectedTexture());
          });
          this.animation.setKfTexture(this.animation.getSelectedTexture());
        }
        break;
      case "Equal":
        if (this.animation.getSelectedTexture() != -1) {
          this.animation.getScene().meshes.forEach((mesh, index) => {
            mesh.setFrame(this.animation.getSelectedTexture());
          });
        }
        break;
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }

  private mouseCameraRay(x_ndc: number, y_ndc: number) {
    const P_clip = new Vec4([x_ndc, y_ndc, -1.0, 1.0]);
    const P_inv = new Mat4();
    const V_inv = new Mat4();
    this.camera.projMatrix().copy().inverse(P_inv);
    this.camera.viewMatrix().copy().inverse(V_inv);
    const P_view = P_inv.multiplyVec4(P_clip);
    P_view.scale(1.0 / P_view.w);
    const P_world = new Vec3(V_inv.multiplyVec4(P_view).xyz);
    const dir = new Vec3();
    P_world.subtract(this.camera.pos(), dir);
    dir.normalize();
    return new Ray(this.camera.pos(), dir);
  }
}