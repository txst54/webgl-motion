import * as fs from "fs";

export interface BVHJoint {
  name: string;
  offset: number[];
  channels: string[];
  children: BVHJoint[];
}

export interface BVHData {
  root: BVHJoint;
  jointNames: string[];
  jointMap: Record<string, BVHJoint>;
  motion: number[][];
  frameTime: number;
  numFrames: number;
}

/**
 * BVH file parser (ASCII format).
 */
export class BVHParser {
  static parse(filePath: string): BVHData {
    const text = fs.readFileSync(filePath, "utf-8").replace(/\r/g, "");
    const lines = text.split("\n");

    let i = 0;
    let jointStack: BVHJoint[] = [];
    let root: BVHJoint | null = null;
    let jointMap: Record<string, BVHJoint> = {};
    let jointNames: string[] = [];
    let currentJoint: BVHJoint | null = null;

    // Parse HIERARCHY section
    while (i < lines.length && !lines[i].startsWith("MOTION")) {
      const line = lines[i].trim();
      if (line.startsWith("ROOT") || line.startsWith("JOINT")) {
        const name = line.split(/\s+/)[1];
        const joint: BVHJoint = {
          name,
          offset: [0, 0, 0],
          channels: [],
          children: [],
        };
        if (!root) root = joint;
        if (currentJoint) currentJoint.children.push(joint);
        jointStack.push(joint);
        currentJoint = joint;
        jointNames.push(name);
        jointMap[name] = joint;
      } else if (line.startsWith("End Site")) {
        const joint: BVHJoint = {
          name: currentJoint!.name + "_end",
          offset: [0, 0, 0],
          channels: [],
          children: [],
        };
        currentJoint!.children.push(joint);
        jointNames.push(joint.name);
      } else if (line.startsWith("OFFSET")) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        currentJoint!.offset = parts;
      } else if (line.startsWith("CHANNELS")) {
        const channels = line.split(/\s+/).slice(2);
        currentJoint!.channels = channels;
      } else if (line.startsWith("}")) {
        jointStack.pop();
        currentJoint = jointStack[jointStack.length - 1] || null;
      }
      i++;
    }

    // Parse MOTION section
    while (i < lines.length && !lines[i].startsWith("Frames:")) i++;
    const numFrames = parseInt(lines[i].split(/\s+/)[1]);
    i++;
    const frameTime = parseFloat(lines[i].split(/\s+/)[2]);
    i++;

    const motion: number[][] = [];
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(/\s+/).map(Number);
      motion.push(values);
    }

    return { root: root!, jointNames, jointMap, motion, frameTime, numFrames };
  }
}
